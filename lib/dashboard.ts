import { userCan, userPermissions } from "./access";
import { chicagoDay, money, recentDays, runningTotal, seriesFrom, tally, windowSum } from "./dashboard-math";
import { getDb, readDoc } from "./db";
import type { Flag } from "./types";

const PALETTE = ["#354bc8", "#ec7256", "#2f9e8f", "#e0a106", "#7c5cdb", "#3a4354", "#ff8f6b", "#1c319e", "#6ea8fe", "#8a94a6"];

export type Slice = { label: string; value: number; color: string };
export type Point = { label: string; value: number };
export type ChartCard = {
  title: string;
  href?: string;
  wide?: boolean;
  kind: "donut" | "columns" | "bars" | "area";
  unit?: string;
  slices?: Slice[];
  points?: Point[];
  lines?: string[];
  empty: string;
};
export type Kpi = { label: string; value: string; hint: string; href?: string };
export type Attention = { href: string; title: string; detail: string };

type Staff = { id: number; role: string };

const STATUS_WORDS: Record<string, string> = {
  paid: "Paid",
  pending: "Waiting for payment",
  failed: "Failed",
  cancelled: "Cancelled",
  open: "Open",
  waiting_on_us: "Waiting on us",
  waiting_on_customer: "Waiting on the customer",
  resolved: "Resolved",
  closed: "Closed",
  low: "Low",
  normal: "Normal",
  high: "High",
  created: "On the phone system",
  waiting: "Waiting",
  manual: "Finished on the server",
  failed_ext: "Needs attention",
  requested: "Requested",
  submitted: "Submitted",
  ordered: "Ordered",
  completed: "Completed",
  exception: "Needs a look",
  contact: "Contact",
  custom_plan: "Custom plan",
  customer: "Customers",
  staff: "Staff",
  super_admin: "Super admins",
  ring: "Ring groups",
  queue: "Call queues",
  missing: "No emergency address",
  saved: "Saved, not sent",
  sent: "Sent to the phone company",
  needs_person: "Needs a person",
  done: "Done",
  trunk_live: "Live trunk",
  trunk_waiting: "Trunk waiting",
  trunk_done: "Trunk finished by the team",
  number: "New number",
  port: "Number transfer",
};

function labelOf(value: string) {
  return STATUS_WORDS[value] || value.replaceAll("_", " ");
}

function slicesFrom(counts: Map<string, number>, order?: string[]) {
  const keys = order ? order.filter((key) => counts.has(key)) : [...counts.keys()];
  for (const key of counts.keys()) if (!keys.includes(key)) keys.push(key);
  return keys
    .map((key, index) => ({ label: labelOf(key), value: counts.get(key) || 0, color: PALETTE[index % PALETTE.length] }))
    .filter((slice) => slice.value > 0);
}

function can(user: Staff, permissions: string[], key: string) {
  return userCan(user, key, permissions);
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function dashboardFor(user: Staff) {
  const permissions = user.role === "super_admin" ? [] : userPermissions(user.id);
  const database = getDb();
  const days = recentDays(30);
  const kpis: Kpi[] = [];
  const cards: ChartCard[] = [];
  const attention: Attention[] = [];

  const seeTickets = can(user, permissions, "tickets.view") || can(user, permissions, "tickets.view_all") || can(user, permissions, "tickets.reply");
  if (seeTickets) {
    const memberships = new Set(
      (database.prepare("SELECT group_id FROM ticket_group_members WHERE user_id = ?").all(user.id) as { group_id: number }[]).map((row) => row.group_id),
    );
    const groups = new Map((database.prepare("SELECT id, name FROM ticket_groups").all() as { id: number; name: string }[]).map((row) => [row.id, row.name]));
    let tickets = database.prepare("SELECT id, status, priority, group_id, assignee_id, created_at, subject FROM tickets").all() as {
      id: number;
      status: string;
      priority: string;
      group_id: number | null;
      assignee_id: number | null;
      created_at: string;
      subject: string;
    }[];
    if (user.role !== "super_admin" && !can(user, permissions, "tickets.view_all")) {
      tickets = tickets.filter((ticket) => (ticket.group_id != null && memberships.has(ticket.group_id)) || ticket.assignee_id === user.id);
    }
    const open = tickets.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed");
    const opened = seriesFrom(days, tickets.map((ticket) => ({ at: ticket.created_at })));
    kpis.push({
      label: "Open tickets",
      value: String(open.length),
      hint: `${windowSum(opened, 7)} opened in the last 7 days`,
      href: "/admin/tickets",
    });
    cards.push({
      title: "Tickets opened over 30 days",
      href: "/admin/tickets",
      kind: "area",
      wide: true,
      points: runningTotal(opened),
      empty: "No tickets in the last 30 days.",
    });
    cards.push({
      title: "Ticket status",
      href: "/admin/tickets",
      kind: "donut",
      slices: slicesFrom(tally(tickets, (ticket) => ticket.status), ["open", "waiting_on_us", "waiting_on_customer", "resolved", "closed"]),
      empty: "No tickets yet.",
    });
    cards.push({
      title: "Priority of open tickets",
      href: "/admin/tickets",
      kind: "donut",
      slices: slicesFrom(tally(open, (ticket) => ticket.priority), ["high", "normal", "low"]),
      empty: "No open tickets.",
    });
    const byGroup = new Map<string, number>();
    for (const ticket of open) byGroup.set(groups.get(ticket.group_id || 0) || "Unassigned", (byGroup.get(groups.get(ticket.group_id || 0) || "Unassigned") || 0) + 1);
    cards.push({
      title: "Open tickets by team",
      href: "/admin/tickets",
      kind: "bars",
      points: [...byGroup.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      empty: "No open tickets are waiting on a team.",
    });
    for (const ticket of open.filter((item) => item.priority === "high").slice(0, 3)) {
      attention.push({ href: `/admin/tickets/${ticket.id}`, title: `SC-${ticket.id} · ${ticket.subject}`, detail: "High priority and still open" });
    }
  }

  if (can(user, permissions, "settings.payments")) {
    const payments = database.prepare("SELECT status, amount_cents, product_kind, plan_name, bundle_name, created_at, paid_at FROM payment_attempts").all() as {
      status: string;
      amount_cents: number;
      product_kind: string;
      plan_name: string;
      bundle_name: string;
      created_at: string;
      paid_at: string;
    }[];
    const paid = payments.filter((row) => row.status === "paid");
    const paidSeries = seriesFrom(days, paid.map((row) => ({ at: row.paid_at || row.created_at, amount: row.amount_cents })), true);
    const thisWeek = windowSum(paidSeries, 7);
    const priorWeek = paidSeries.slice(-14, -7).reduce((sum, point) => sum + point.value, 0);
    kpis.push({
      label: "Paid in 7 days",
      value: money(thisWeek),
      hint: `${money(priorWeek)} the 7 days before that`,
      href: "/admin/gateways",
    });
    cards.push({
      title: "Money received",
      href: "/admin/gateways",
      kind: "columns",
      wide: true,
      unit: "cents",
      points: paidSeries,
      empty: "No paid charges in the last 30 days.",
    });
    cards.push({
      title: "Payment results",
      href: "/admin/gateways",
      kind: "donut",
      slices: slicesFrom(tally(payments, (row) => row.status), ["paid", "pending", "failed", "cancelled"]),
      empty: "No payment attempts yet.",
    });
    const byProduct = new Map<string, number>();
    for (const row of paid) {
      const name = row.product_kind === "bundle" ? row.bundle_name || "Minute bundle" : row.plan_name || "Plan";
      byProduct.set(name, (byProduct.get(name) || 0) + row.amount_cents);
    }
    cards.push({
      title: "Paid amount by product",
      href: "/admin/gateways",
      kind: "bars",
      unit: "cents",
      points: [...byProduct.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
      empty: "No paid products yet.",
    });
    const failed = payments.filter((row) => row.status === "failed" && chicagoDay(row.created_at) >= days[0]).length;
    if (failed) attention.push({ href: "/admin/gateways", title: `${failed} failed payment${failed === 1 ? "" : "s"}`, detail: "In the last 30 days" });
  }

  if (can(user, permissions, "inbox.messages")) {
    const messages = database.prepare("SELECT kind, created_at FROM messages").all() as { kind: string; created_at: string }[];
    const series = seriesFrom(days, messages.map((row) => ({ at: row.created_at })));
    kpis.push({ label: "Messages in 7 days", value: String(windowSum(series, 7)), hint: `${messages.length} saved in total`, href: "/admin/messages" });
    cards.push({ title: "Messages", href: "/admin/messages", kind: "columns", points: series, empty: "No messages in the last 30 days." });
    cards.push({ title: "Where messages come from", href: "/admin/messages", kind: "donut", slices: slicesFrom(tally(messages, (row) => row.kind || "contact")), empty: "No messages yet." });
  }

  if (can(user, permissions, "inbox.requests")) {
    const requests = database.prepare("SELECT kind, status FROM account_requests").all() as { kind: string; status: string }[];
    const counts = new Map<string, number>();
    for (const row of requests) counts.set(`${labelOf(row.kind)} · ${labelOf(row.status)}`, (counts.get(`${labelOf(row.kind)} · ${labelOf(row.status)}`) || 0) + 1);
    cards.push({
      title: "Number and transfer requests",
      href: "/admin/requests",
      kind: "bars",
      points: [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      empty: "No number or transfer requests yet.",
    });
    const exceptions = requests.filter((row) => row.status === "exception").length;
    if (exceptions) attention.push({ href: "/admin/requests", title: `${exceptions} request${exceptions === 1 ? "" : "s"} need a look`, detail: "Status is exception" });
  }

  if (can(user, permissions, "settings.phone")) {
    const extensions = database.prepare("SELECT status FROM pbx_extensions").all() as { status: string }[];
    const groups = database.prepare("SELECT kind, status FROM call_groups").all() as { kind: string; status: string }[];
    const removedExtensions = extensions.filter((row) => row.status === "removed").length;
    kpis.push({ label: "People on the phone system", value: String(extensions.filter((row) => row.status === "created").length), hint: `${extensions.length - removedExtensions} current, ${removedExtensions} removed and kept`, href: "/admin/phone" });
    cards.push({ title: "Extensions", href: "/admin/phone", kind: "donut", slices: slicesFrom(tally(extensions, (row) => row.status), ["created", "waiting", "failed", "removed"]), empty: "No extensions yet." });
    cards.push({ title: "Ring groups and queues", href: "/admin/phone", kind: "donut", slices: slicesFrom(tally(groups, (row) => row.kind), ["ring", "queue"]), empty: "No ring groups or queues yet." });
    cards.push({
      title: "Group setup",
      href: "/admin/phone",
      kind: "bars",
      points: [...tally(groups, (row) => row.status).entries()].map(([key, value]) => ({ label: labelOf(key), value })),
      empty: "No groups yet.",
    });
    const stuck = groups.filter((row) => row.status === "failed" || row.status === "waiting").length + extensions.filter((row) => row.status === "failed").length;
    if (stuck) attention.push({ href: "/admin/phone", title: `${stuck} phone setup item${stuck === 1 ? "" : "s"} still waiting`, detail: "Extensions, ring groups, or queues are not on 3CX yet" });
  }

  if (can(user, permissions, "settings.lines")) {
    const lines = database.prepare("SELECT status, e911_status FROM phone_lines").all() as { status: string; e911_status: string }[];
    const tasks = database.prepare("SELECT status FROM trunk_tasks").all() as { status: string }[];
    const grants = database.prepare("SELECT kind, minutes, period_start, period_end FROM minute_grants").all() as { kind: string; minutes: number; period_start: string; period_end: string }[];
    const used = (database.prepare("SELECT COALESCE(SUM(seconds), 0) AS seconds FROM minute_debits").get() as { seconds: number }).seconds;
    const now = new Date().toISOString();
    const activeMinutes = grants.filter((grant) => now >= grant.period_start && now < grant.period_end).reduce((sum, grant) => sum + grant.minutes, 0);
    const usedMinutes = Math.floor(Number(used) / 60);
    kpis.push({ label: "Purchased numbers", value: String(lines.length), hint: `${lines.filter((line) => line.e911_status === "done").length} emergency addresses finished`, href: "/admin/lines" });
    cards.push({ title: "Number trunks", href: "/admin/lines", kind: "donut", slices: slicesFrom(tally(lines, (line) => line.status)), empty: "No purchased numbers yet." });
    cards.push({ title: "Emergency addresses", href: "/admin/lines", kind: "donut", slices: slicesFrom(tally(lines, (line) => line.e911_status), ["done", "sent", "saved", "needs_person", "missing"]), empty: "No numbers yet." });
    cards.push({
      title: "Call minutes",
      href: "/admin/lines",
      kind: "bars",
      points: [
        { label: "Minutes still in active grants", value: Math.max(0, activeMinutes - usedMinutes) },
        { label: "Minutes used", value: usedMinutes },
      ].filter((point) => point.value > 0),
      empty: "No call minutes have been granted.",
    });
    cards.push({
      title: "Trunk tasks",
      href: "/admin/lines",
      kind: "donut",
      slices: slicesFrom(tally(tasks, (task) => task.status), ["open", "done"]),
      empty: "No trunk tasks.",
    });
    const openTasks = tasks.filter((task) => task.status === "open").length;
    if (openTasks) attention.push({ href: "/admin/lines", title: `${openTasks} trunk${openTasks === 1 ? "" : "s"} to finish on the server`, detail: "3CX did not take the number automatically" });
    const missingAddress = lines.filter((line) => line.e911_status !== "done").length;
    if (missingAddress) attention.push({ href: "/admin/lines", title: `${missingAddress} emergency address${missingAddress === 1 ? "" : "es"} not finished`, detail: "These numbers still need a completed address" });
  }

  if (can(user, permissions, "users.customers")) {
    const customers = database.prepare("SELECT created_at, disabled FROM users WHERE role = 'customer'").all() as { created_at: string; disabled: number }[];
    kpis.push({
      label: "Customers",
      value: String(customers.filter((person) => !person.disabled).length),
      hint: `${customers.filter((person) => person.disabled).length} turned off`,
      href: "/admin/customers",
    });
    cards.push({ title: "New customers", href: "/admin/customers", kind: "columns", points: seriesFrom(days, customers.map((person) => ({ at: person.created_at }))), empty: "No new customers in the last 30 days." });
  }

  if (can(user, permissions, "access.manage")) {
    const people = database.prepare("SELECT role, access_role_id, disabled FROM users WHERE role IN ('staff', 'super_admin')").all() as { role: string; access_role_id: number; disabled: number }[];
    const roles = new Map((database.prepare("SELECT id, name FROM access_roles").all() as { id: number; name: string }[]).map((row) => [row.id, row.name]));
    kpis.push({ label: "Admin users", value: String(people.filter((person) => !person.disabled).length), hint: `${people.filter((person) => person.role === "super_admin").length} super admins`, href: "/admin/team" });
    cards.push({ title: "Admin account types", href: "/admin/team", kind: "donut", slices: slicesFrom(tally(people, (person) => person.role), ["staff", "super_admin"]), empty: "No admin accounts." });
    const byLevel = new Map<string, number>();
    for (const person of people.filter((item) => item.role === "staff")) {
      const name = roles.get(person.access_role_id) || "No access";
      byLevel.set(name, (byLevel.get(name) || 0) + 1);
    }
    cards.push({
      title: "Staff by access level",
      href: "/admin/access",
      kind: "bars",
      points: [...byLevel.entries()].map(([label, value]) => ({ label, value })),
      empty: "No staff accounts yet.",
    });
  }

  if (can(user, permissions, "settings.flags")) {
    const flags = readDoc<Flag[]>("flags");
    const off = flags.filter((flag) => !flag.enabled).map((flag) => flag.label);
    cards.push({
      title: "Feature switches",
      href: "/admin/flags",
      kind: "donut",
      slices: [
        { label: "On", value: flags.filter((flag) => flag.enabled).length, color: PALETTE[2] },
        { label: "Off", value: off.length, color: "#c5cad6" },
      ].filter((slice) => slice.value > 0),
      lines: off,
      empty: "No switches.",
    });
  }

  if (can(user, permissions, "settings.connections")) {
    const connections = database.prepare("SELECT provider, enabled, last_ok, last_message FROM connections").all() as { provider: string; enabled: number; last_ok: number; last_message: string }[];
    cards.push({
      title: "System connections",
      href: "/admin/connections",
      kind: "donut",
      slices: [
        { label: "Last check worked", value: connections.filter((connection) => connection.enabled && connection.last_ok).length, color: PALETTE[2] },
        { label: "Needs a check", value: connections.filter((connection) => !connection.enabled || !connection.last_ok).length, color: PALETTE[1] },
      ].filter((slice) => slice.value > 0),
      lines: connections.map((connection) => `${connection.provider === "voipms" ? "VoIP.ms" : "3CX"}: ${connection.enabled ? connection.last_message || "Not checked yet" : "Turned off"}`),
      empty: "No phone connections are saved.",
    });
  }

  if (can(user, permissions, "blog.manage")) {
    const posts = database.prepare("SELECT published FROM faq_posts").all() as { published: number }[];
    cards.push({
      title: "FAQ articles",
      href: "/admin/faq",
      kind: "donut",
      slices: [
        { label: "Published", value: posts.filter((post) => post.published).length, color: PALETTE[0] },
        { label: "Draft", value: posts.filter((post) => !post.published).length, color: PALETTE[1] },
      ].filter((slice) => slice.value > 0),
      empty: "No FAQ articles yet.",
    });
  }

  if (can(user, permissions, "inbox.media")) {
    const media = (database.prepare("SELECT COUNT(*) AS n FROM media").get() as { n: number }).n;
    kpis.push({ label: "Pictures", value: String(media), hint: "Uploaded for the site", href: "/admin/media" });
  }

  return { kpis, cards, attention: attention.slice(0, 8) };
}
