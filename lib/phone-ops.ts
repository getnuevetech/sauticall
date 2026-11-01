import { groupMembers, strategyLabel } from "./call-groups";
import { getDb } from "./db";
import { extensionRange } from "./extension-numbers";
import { readExtensionPlan } from "./extension-plan";
import { extensionCapacity } from "./plan-features";
import { paidPlan } from "./pbx";
import { shownAccountName } from "./pbx-user";
import { trunkSubjectMatchesLine } from "./trunk-tries";
import { savedDefaultRoute } from "./trunk-prereq";

export { companyMatches, formatDid, lineStatusLabel, maskCredential, personState, setupEmailState, setupLabel, setupStatus, trunkAdminSummary, trunkProgress, trunkStep, trunkTone } from "./phone-ops-view";
import { formatDid, lineStatusLabel, personState, setupStatus } from "./phone-ops-view";

type Count = { user_id: number; status: string; n: number };

export type CompanyRow = {
  id: number;
  name: string;
  email: string;
  department: string;
  departmentLive: boolean;
  departmentMessage: string;
  from: string;
  to: string;
  allowance: number;
  records: number;
  live: number;
  failed: number;
  waiting: number;
  status: ReturnType<typeof setupStatus>;
  ring: string;
  ringState: string;
};

function countsFor(rows: Count[]) {
  const map = new Map<number, { records: number; live: number; failed: number; waiting: number }>();
  for (const row of rows) {
    const current = map.get(row.user_id) || { records: 0, live: 0, failed: 0, waiting: 0 };
    if (row.status !== "removed") current.records += row.n;
    if (row.status === "created") current.live += row.n;
    if (row.status === "failed") current.failed += row.n;
    if (row.status === "waiting") current.waiting += row.n;
    map.set(row.user_id, current);
  }
  return map;
}

export function listCompanies(query = "", status = "") {
  const database = getDb();
  const people = database.prepare(
    `SELECT u.id, u.name, u.email, u.business_name,
            COALESCE(d.name, '') AS department,
            COALESCE(d.xapi_id, 0) AS department_live,
            COALESCE(d.last_message, '') AS department_message,
            COALESCE(d.number_from, '') AS number_from,
            COALESCE(d.number_to, '') AS number_to
     FROM users u
     LEFT JOIN pbx_departments d ON d.user_id = u.id
     WHERE u.role = 'customer'
     ORDER BY u.name COLLATE NOCASE, u.email`,
  ).all() as { id: number; name: string; email: string; business_name: string; department: string; department_live: number; department_message: string; number_from: string; number_to: string }[];
  const extensions = countsFor(database.prepare("SELECT user_id, status, COUNT(*) AS n FROM pbx_extensions GROUP BY user_id, status").all() as Count[]);
  const groupFailed = new Map((database.prepare("SELECT user_id, COUNT(*) AS n FROM call_groups WHERE status = 'failed' GROUP BY user_id").all() as { user_id: number; n: number }[]).map((row) => [row.user_id, row.n]));
  const active = new Set([
    ...(database.prepare("SELECT DISTINCT user_id FROM pbx_extensions").all() as { user_id: number }[]),
    ...(database.prepare("SELECT DISTINCT user_id FROM call_groups").all() as { user_id: number }[]),
    ...(database.prepare("SELECT DISTINCT user_id FROM phone_lines").all() as { user_id: number }[]),
    ...(database.prepare("SELECT user_id FROM pbx_departments").all() as { user_id: number }[]),
  ].map((row) => row.user_id));
  const plan = readExtensionPlan();
  const needle = query.trim().toLowerCase();
  const rows: CompanyRow[] = [];
  for (const person of people) {
    if (!active.has(person.id)) continue;
    const count = extensions.get(person.id) || { records: 0, live: 0, failed: 0, waiting: 0 };
    const failed = count.failed + (groupFailed.get(person.id) || 0) + (person.department_message && /rejected|400|failed|refused/i.test(person.department_message) ? 1 : 0);
    const setup = setupStatus({ records: count.records, failed, waiting: count.waiting, live: count.live });
    const name = person.name || person.email;
    if (needle && !`${name} ${person.email} ${person.department} ${person.business_name || ""}`.toLowerCase().includes(needle)) continue;
    if (status && status !== "all" && setup !== status) continue;
    const paid = paidPlan(person.id);
    const range = person.number_from && person.number_to ? { from: person.number_from, to: person.number_to } : extensionRange(person.id, plan);
    const ring = database.prepare("SELECT name, number, status FROM call_groups WHERE user_id = ? AND kind = 'ring' AND answers = 1 ORDER BY id DESC LIMIT 1").get(person.id) as { name: string; number: string; status: string } | undefined;
    rows.push({
      id: person.id,
      name,
      email: person.email,
      department: shownAccountName(person.department, person.business_name || "", person.name) || "Company name not set",
      departmentLive: person.department_live > 0,
      departmentMessage: person.department_message,
      from: String(range.from),
      to: String(range.to),
      allowance: paid ? extensionCapacity(paid) : 0,
      records: count.records,
      live: count.live,
      failed,
      waiting: count.waiting,
      status: setup,
      ring: ring ? `${ring.name} · ${ring.number}` : "",
      ringState: ring ? personState(ring.status).detail : "",
    });
  }
  return rows;
}

export function companyChoices() {
  return listCompanies().map((row) => ({ id: row.id, name: row.name }));
}

export type PersonRow = {
  id: number;
  userId: number;
  number: string;
  former: string;
  first: string;
  last: string;
  email: string;
  status: string;
  xapiId: number;
  message: string;
  welcome: string;
};

export function listPeople(userId: number, query = "", status = "", includeRemoved = false) {
  const needle = query.trim().toLowerCase();
  const rows = getDb().prepare(
    `SELECT id, user_id, number, former_number, first_name, last_name, email, status, xapi_id, last_message, welcome_note
     FROM pbx_extensions WHERE user_id = ? ORDER BY number`,
  ).all(userId) as { id: number; user_id: number; number: string; former_number: string; first_name: string; last_name: string; email: string; status: string; xapi_id: number; last_message: string; welcome_note: string }[];
  return rows.filter((row) => {
    if (!includeRemoved && row.status === "removed") return false;
    if (status && status !== "all" && personState(row.status).tone !== status && row.status !== status) return false;
    const shown = row.status === "removed" && row.former_number ? row.former_number : row.number;
    return !needle || `${shown} ${row.first_name} ${row.last_name} ${row.email}`.toLowerCase().includes(needle);
  }).map((row) => ({
    id: row.id,
    userId: row.user_id,
    number: row.status === "removed" && row.former_number ? row.former_number : row.number,
    former: row.former_number,
    first: row.first_name,
    last: row.last_name,
    email: row.email,
    status: row.status,
    xapiId: row.xapi_id,
    message: row.last_message,
    welcome: row.welcome_note,
  }));
}

export type GroupView = {
  id: number;
  userId: number;
  kind: string;
  name: string;
  number: string;
  strategy: string;
  answers: boolean;
  status: string;
  xapiId: number;
  message: string;
  members: { number: string; first: string; last: string }[];
};

export function listGroups(userId: number, kind: "ring" | "queue", query = "", status = "") {
  const needle = query.trim().toLowerCase();
  const rows = getDb().prepare(
    `SELECT id, user_id, kind, name, number, strategy, answers, status, xapi_id, last_message
     FROM call_groups WHERE user_id = ? AND kind = ? ORDER BY number`,
  ).all(userId, kind) as { id: number; user_id: number; kind: string; name: string; number: string; strategy: string; answers: number; status: string; xapi_id: number; last_message: string }[];
  return rows.filter((row) => {
    if (status && status !== "all" && personState(row.status).tone !== status && row.status !== status) return false;
    return !needle || `${row.name} ${row.number}`.toLowerCase().includes(needle);
  }).map((row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    number: row.number,
    strategy: strategyLabel(row.kind, row.strategy),
    answers: row.answers === 1,
    status: row.status,
    xapiId: row.xapi_id,
    message: row.last_message,
    members: groupMembers(row.id).map((member) => ({ number: member.number, first: member.first_name, last: member.last_name })),
  }));
}

export function companyRouting(userId: number) {
  const group = getDb().prepare(
    "SELECT kind, name, number, status FROM call_groups WHERE user_id = ? AND answers = 1 ORDER BY id DESC LIMIT 1",
  ).get(userId) as { kind: string; name: string; number: string; status: string } | undefined;
  const first = getDb().prepare(
    "SELECT number, first_name, last_name FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY id LIMIT 1",
  ).get(userId) as { number: string; first_name: string; last_name: string } | undefined;
  const confirmed = Boolean(group && (group.status === "created" || group.status === "manual"));
  return {
    daytime: group ? `${group.kind === "queue" ? "Queue" : "Ring group"} ${group.name} · ${group.number}` : first ? `Extension ${first.number}` : "Not set",
    daytimeNote: group ? (confirmed ? "Saved as the daytime target. Not rechecked on the phone system." : "Saved here. The phone system has not accepted this group.") : "No group answers daytime calls, so the first extension is the saved target.",
    afterHours: "Voicemail",
    fallback: "First extension",
  };
}

export type LineView = {
  id: number;
  userId: number;
  requestId: number;
  email: string;
  company: string;
  did: string;
  status: string;
  trunkId: number;
  trunkNumber: string;
  message: string;
  department: string;
  extension: string;
  from: string;
  to: string;
  routeLabel: string;
  departmentOnPbx: boolean;
  extensionOnPbx: boolean;
  routeOnPbx: boolean;
  inboundOnPbx: boolean;
  outboundOnPbx: boolean;
  outboundAssigned: boolean;
  departmentLimited: boolean;
  sipUser: string;
  sipHost: string;
  hasAccount: boolean;
  taskOpen: boolean;
  taskNote: string;
  e911: string;
  e911Message: string;
  attempts: number;
  routes: boolean;
  siblings: { id: number; did: string; trunkId: number }[];
};

export type LoggedTrunkAttempt = {
  userId: number;
  company: string;
  email: string;
  subject: string;
  attempts: number;
  latest: string;
};

export function listLines(query = "", company = 0, status = "") {
  const rows = getDb().prepare(
    `SELECT l.id, l.user_id, l.request_id, u.email, u.name, u.business_name, l.did, l.status, l.trunk_id, l.trunk_number, l.trunk_attempts, l.trunk_routes, l.trunk_inbound, l.trunk_outbound, l.trunk_department, l.trunk_rule_group, l.route_label, l.last_message,
            l.e911_status, l.e911_message,
            COALESCE(d.name, '') AS department, COALESCE(d.xapi_id, 0) AS department_xapi, COALESCE(d.number_from, '') AS number_from, COALESCE(d.number_to, '') AS number_to,
            COALESCE(t.extension_number, '') AS extension_number, COALESCE(t.sip_user, '') AS sip_user, COALESCE(t.sip_host, '') AS sip_host,
            COALESCE(t.status, '') AS task_status, COALESCE(t.note, '') AS task_note,
            CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END AS has_account,
            COALESCE(s.username, '') AS sub_user, COALESCE(s.sip_host, '') AS sub_host,
            COALESCE((SELECT number FROM pbx_extensions WHERE user_id = l.user_id AND status != 'removed' ORDER BY id LIMIT 1), '') AS owned_extension,
            COALESCE((SELECT xapi_id FROM pbx_extensions WHERE user_id = l.user_id AND status != 'removed' ORDER BY id LIMIT 1), 0) AS extension_xapi,
            COALESCE((SELECT ai_role FROM pbx_extensions WHERE user_id = l.user_id AND status != 'removed' ORDER BY id LIMIT 1), '') AS ai_role,
            COALESCE((SELECT name || ' · ' || number FROM call_groups WHERE user_id = l.user_id AND kind = 'ring' AND xapi_id != 0 ORDER BY answers DESC, id LIMIT 1), '') AS ring_label
     FROM phone_lines l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN pbx_departments d ON d.user_id = l.user_id
     LEFT JOIN trunk_tasks t ON t.line_id = l.id
     LEFT JOIN voip_subaccounts s ON s.user_id = l.user_id
     ORDER BY l.id DESC`,
  ).all() as {
    id: number; user_id: number; request_id: number; email: string; name: string; business_name: string; did: string; status: string; trunk_id: number; trunk_number: string; trunk_attempts: number; trunk_routes: number; trunk_inbound: number; trunk_outbound: number; trunk_department: number; trunk_rule_group: number; route_label: string; last_message: string;
    e911_status: string; e911_message: string; department: string; department_xapi: number; number_from: string; number_to: string; extension_number: string;
    sip_user: string; sip_host: string; task_status: string; task_note: string; has_account: number; sub_user: string; sub_host: string;
    owned_extension: string; extension_xapi: number; ai_role: string; ring_label: string;
  }[];
  const plan = readExtensionPlan();
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (company && row.user_id !== company) return false;
    if (status && status !== "all" && lineStatusLabel(row.status).toLowerCase().replace(/\s/g, "") !== status && row.status !== status) return false;
    const text = `${row.name} ${row.business_name || ""} ${row.email} ${row.did} ${row.department}`.toLowerCase();
    return !needle || text.includes(needle) || formatDid(row.did).toLowerCase().includes(needle);
  });
  return visible.map((row) => {
    const route = savedDefaultRoute(row.user_id);
    return {
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id,
    email: row.email,
    company: shownAccountName(row.department, row.business_name || "", row.name) || row.name || row.email,
    did: row.did,
    status: row.status,
    trunkId: row.trunk_id,
    trunkNumber: row.trunk_number || "",
    message: row.last_message || row.task_note,
    department: shownAccountName(row.department, row.business_name || "", row.name) || "Company name not set",
    extension: route.extensionNumber || row.owned_extension || row.extension_number,
    from: row.number_from || String(extensionRange(row.user_id, plan).from),
    to: row.number_to || String(extensionRange(row.user_id, plan).to),
    routeLabel: route.label || row.route_label,
    departmentOnPbx: Number(row.department_xapi) > 0,
    extensionOnPbx: route.extensionOnPbx,
    routeOnPbx: route.onPbx,
    inboundOnPbx: row.trunk_inbound === 1 || row.trunk_routes === 1,
    outboundOnPbx: row.trunk_outbound === 1 || row.trunk_routes === 1,
    outboundAssigned: row.trunk_rule_group === 1 || row.trunk_routes === 1,
    departmentLimited: row.trunk_department === 1,
    sipUser: row.sip_user || row.sub_user,
    sipHost: row.sip_host || row.sub_host,
    hasAccount: row.has_account === 1,
    taskOpen: row.task_status === "open",
    taskNote: row.task_note,
    e911: row.e911_status,
    e911Message: row.e911_message,
    attempts: row.trunk_attempts || 0,
    routes: row.trunk_routes === 1,
    siblings: rows.filter((other) => other.user_id === row.user_id && other.id !== row.id).map((other) => ({ id: other.id, did: other.did, trunkId: other.trunk_id })),
  };
  });
}

export function unmatchedTrunkLogs(query = "", company = 0): LoggedTrunkAttempt[] {
  const lines = getDb().prepare("SELECT user_id, did FROM phone_lines").all() as { user_id: number; did: string }[];
  const rows = getDb().prepare(
    `SELECT f.user_id, f.subject, f.detail, COALESCE(u.name, '') AS name, COALESCE(u.business_name, '') AS business_name, COALESCE(u.email, '') AS email
     FROM failure_log f
     LEFT JOIN users u ON u.id = f.user_id
     WHERE f.area = 'trunk'
     ORDER BY f.id DESC`,
  ).all() as { user_id: number; subject: string; detail: string; name: string; business_name: string; email: string }[];
  const needle = query.trim().toLowerCase();
  const grouped = new Map<string, LoggedTrunkAttempt>();
  for (const row of rows) {
    if (company && row.user_id !== company) continue;
    if (lines.some((line) => line.user_id === row.user_id && trunkSubjectMatchesLine(row.subject, line.did))) continue;
    const companyName = shownAccountName("", row.business_name, row.name) || row.name || row.email || "Unknown account";
    const text = `${companyName} ${row.email} ${row.subject}`.toLowerCase();
    if (needle && !text.includes(needle)) continue;
    const key = `${row.user_id}|${row.subject}`;
    const current = grouped.get(key);
    if (current) {
      current.attempts += 1;
      continue;
    }
    grouped.set(key, {
      userId: row.user_id,
      company: companyName,
      email: row.email,
      subject: row.subject,
      attempts: 1,
      latest: row.detail.replace(/\s+/g, " ").slice(0, 180),
    });
  }
  return [...grouped.values()];
}
