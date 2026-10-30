"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyPermission, requirePermission, userCan } from "@/lib/access";
import { knownPermissions } from "@/lib/access-catalog";
import { hashPassword } from "@/lib/auth";
import { audit, getDb } from "@/lib/db";
import { slugify } from "@/lib/faq-markdown";
import { parseMailPayload } from "@/lib/mail-parse";
import { createStaffTicket, findCustomersByEmail, mailSettings, receiveMail, rotateInboundSecret, saveGroupMembers, saveMail, saveTicketGroup, saveTopic, setTicketFields, staffReply } from "@/lib/tickets";

function back(path: string, error: string): never {
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}error=${encodeURIComponent(error)}`);
}

export async function saveAccessRole(formData: FormData) {
  const user = await requirePermission("access.manage");
  const id = Number(formData.get("id") || 0);
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const description = String(formData.get("description") || "").trim().slice(0, 300);
  const permissions = knownPermissions(formData.getAll("permissions").map((item) => String(item)));
  const path = id ? `/admin/access?level=${id}` : "/admin/access?level=new";
  if (!name) back(path, "Give the access level a name.");
  if (id) {
    const existing = getDb().prepare("SELECT id FROM access_roles WHERE id = ?").get(id);
    if (!existing) back("/admin/access", "That access level was not found.");
    try {
      getDb().prepare("UPDATE access_roles SET name = ?, description = ?, permissions_json = ? WHERE id = ?").run(name, description, JSON.stringify(permissions), id);
    } catch {
      back(path, "An access level with that name already exists.");
    }
    audit(user.email, "access.role", String(id));
    redirect(`/admin/access?level=${id}&saved=1`);
  }
  try {
    const info = getDb().prepare("INSERT INTO access_roles (name, description, permissions_json) VALUES (?, ?, ?)").run(name, description, JSON.stringify(permissions));
    audit(user.email, "access.role", name);
    redirect(`/admin/access?level=${Number(info.lastInsertRowid)}&saved=1`);
  } catch {
    back(path, "An access level with that name already exists.");
  }
}

export async function deleteAccessRole(formData: FormData) {
  const user = await requirePermission("access.manage");
  const id = Number(formData.get("id") || 0);
  const assigned = getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE access_role_id = ?").get(id) as { n: number };
  if (assigned.n) back(`/admin/access?level=${id}`, "Move admin users off this access level before deleting it.");
  getDb().prepare("DELETE FROM access_roles WHERE id = ?").run(id);
  audit(user.email, "access.role.delete", String(id));
  redirect("/admin/access");
}

function accountPath(id: number, kind: "team" | "customers") {
  if (kind === "team") return id ? `/admin/team?user=${id}` : "/admin/team?user=new";
  return id ? `/admin/${kind}/${id}` : `/admin/${kind}`;
}

export async function saveAdminUser(formData: FormData) {
  const actor = await requirePermission("access.manage");
  const id = Number(formData.get("id") || 0);
  const path = accountPath(id, "team");
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const accessRoleId = Number(formData.get("access_role_id") || 0);
  const accountRole = actor.role === "super_admin" && formData.get("account_role") === "super_admin" ? "super_admin" : "staff";
  const disabled = formData.get("disabled") === "on" ? 1 : 0;
  if (!name || !email.includes("@")) back(path, "Name and email are required.");
  if (password && password.length < 10) back(path, "Use a password of at least 10 characters.");
  if (accountRole === "staff") {
    const role = getDb().prepare("SELECT id FROM access_roles WHERE id = ?").get(accessRoleId);
    if (!role) back(path, "Choose an access level.");
  }
  const database = getDb();
  if (id) {
    const target = database.prepare("SELECT id, role, email FROM users WHERE id = ?").get(id) as { id: number; role: string; email: string } | undefined;
    if (!target || (target.role !== "staff" && target.role !== "super_admin")) back("/admin/team", "That admin account was not found.");
    if (target.role === "super_admin" && actor.role !== "super_admin") back(path, "Only a super admin can change a super admin account.");
    if (disabled && id === actor.id) back(path, "You cannot turn off the account you are signed in with.");
    if (target.role === "super_admin" && (disabled || accountRole !== "super_admin")) {
      const others = database.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND disabled = 0 AND id != ?").get(id) as { n: number };
      if (!others.n) back(path, "Keep at least one super admin who can sign in.");
    }
    const clash = database.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, id);
    if (clash) back(path, "That email is already in use.");
    if (password) {
      database.prepare("UPDATE users SET name = ?, email = ?, password_hash = ?, role = ?, access_role_id = ?, disabled = ? WHERE id = ?").run(name, email, hashPassword(password), accountRole, accountRole === "super_admin" ? 0 : accessRoleId, disabled, id);
    } else {
      database.prepare("UPDATE users SET name = ?, email = ?, role = ?, access_role_id = ?, disabled = ? WHERE id = ?").run(name, email, accountRole, accountRole === "super_admin" ? 0 : accessRoleId, disabled, id);
    }
    if (disabled) database.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    audit(actor.email, "access.staff", email);
    redirect(`/admin/team?user=${id}&saved=1`);
  }
  if (password.length < 10) back("/admin/team?user=new", "Use a password of at least 10 characters.");
  try {
    const info = database
      .prepare("INSERT INTO users (email, name, password_hash, role, mfa_secret, access_role_id, disabled, created_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?)")
      .run(email, name, hashPassword(password), accountRole, accountRole === "super_admin" ? 0 : accessRoleId, new Date().toISOString());
    audit(actor.email, "access.staff", email);
    redirect(`/admin/team?user=${Number(info.lastInsertRowid)}&saved=1`);
  } catch {
    back("/admin/team?user=new", "That email is already in use.");
  }
}

export async function saveCustomerUser(formData: FormData) {
  const actor = await requirePermission("users.customers");
  const id = Number(formData.get("id") || 0);
  const path = accountPath(id, "customers");
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const disabled = formData.get("disabled") === "on" ? 1 : 0;
  const mfaRequired = formData.get("mfa_required") === "on" ? 1 : 0;
  if (!id) back("/admin/customers", "That customer was not found.");
  if (!name || !email.includes("@")) back(path, "Name and email are required.");
  if (password && password.length < 10) back(path, "Use a password of at least 10 characters.");
  const target = getDb().prepare("SELECT id, role FROM users WHERE id = ?").get(id) as { id: number; role: string } | undefined;
  if (!target || target.role !== "customer") back("/admin/customers", "That customer was not found.");
  const clash = getDb().prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, id);
  if (clash) back(path, "That email is already in use.");
  if (password) {
    getDb().prepare("UPDATE users SET name = ?, email = ?, password_hash = ?, disabled = ?, mfa_required = ? WHERE id = ? AND role = 'customer'").run(name, email, hashPassword(password), disabled, mfaRequired, id);
  } else {
    getDb().prepare("UPDATE users SET name = ?, email = ?, disabled = ?, mfa_required = ? WHERE id = ? AND role = 'customer'").run(name, email, disabled, mfaRequired, id);
  }
  if (disabled) getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  audit(actor.email, "customer.update", email);
  redirect(`${path}?saved=Saved.`);
}

export async function provisionVoipClient(formData: FormData) {
  const actor = await requirePermission("users.customers");
  const id = Number(formData.get("id") || 0);
  const path = accountPath(id, "customers");
  const target = getDb().prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'").get(id);
  if (!target) back("/admin/customers", "That customer was not found.");
  const { ensureVoipClient } = await import("@/lib/voip-client");
  const result = await ensureVoipClient(id, true);
  audit(actor.email, "voip.client", `${id}:${result.ok ? result.clientId : "failed"}`);
  if (!result.ok) back(path, result.message);
  redirect(`${path}?saved=${encodeURIComponent(`VoIP.ms client ${result.clientId} is linked.`)}`);
}

export async function fundPaidClient(formData: FormData) {
  const actor = await requirePermission("users.customers");
  const id = Number(formData.get("id") || 0);
  const path = accountPath(id, "customers");
  const paid = getDb().prepare("SELECT plan_name FROM payment_attempts WHERE user_id = ? AND status = 'paid' AND product_kind != 'bundle' AND plan_name != '' ORDER BY id DESC LIMIT 1").get(id) as { plan_name: string } | undefined;
  if (!paid) back(path, "This customer has no confirmed plan payment.");
  const { fundPaidPlanWithRetry } = await import("@/lib/voip-client");
  const result = await fundPaidPlanWithRetry(id, paid.plan_name);
  audit(actor.email, "voip.fund", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) back(path, result.message);
  redirect(`${path}?saved=${encodeURIComponent(result.message)}`);
}

export async function searchTicketCustomers(query: string) {
  await requireAnyPermission(["tickets.reply", "tickets.view_all", "tickets.manage"]);
  return findCustomersByEmail(query);
}

export async function createAdminTicket(formData: FormData) {
  const user = await requireAnyPermission(["tickets.reply", "tickets.view_all", "tickets.manage"]);
  const result = await createStaffTicket(user, {
    customerId: Number(formData.get("customer_id") || 0),
    topicId: Number(formData.get("topic_id") || 0),
    subject: String(formData.get("subject") || ""),
    body: String(formData.get("body") || ""),
  });
  if (!result.ok) back("/admin/tickets/new", result.message);
  audit(user.email, "ticket.create", `SC-${result.id}`);
  redirect(`/admin/tickets/${result.id}?saved=${encodeURIComponent(`Ticket SC-${result.id} created. ${result.message}`)}`);
}

export async function replyTicket(formData: FormData) {
  const user = await requirePermission("tickets.reply");
  const id = Number(formData.get("id") || 0);
  const kind = formData.get("kind") === "note" ? "note" : "public";
  const result = await staffReply(user, id, String(formData.get("body") || ""), kind);
  audit(user.email, "ticket.reply", `${id}:${kind}`);
  if (!result.ok) back(`/admin/tickets/${id}`, result.message);
  redirect(`/admin/tickets/${id}?saved=${encodeURIComponent(result.message)}`);
}

export async function updateTicket(formData: FormData) {
  const user = await requireAnyPermission(["tickets.reply", "tickets.view", "tickets.view_all", "tickets.manage"]);
  const id = Number(formData.get("id") || 0);
  const intent = String(formData.get("intent") || "");
  const patch: { status?: string; priority?: string; groupId?: number; assigneeId?: number } = {};
  if (userCan(user, "tickets.reply") || userCan(user, "tickets.view_all")) {
    patch.status = String(formData.get("status") || "");
    patch.priority = String(formData.get("priority") || "");
  }
  if (userCan(user, "tickets.manage") || userCan(user, "tickets.view_all")) patch.groupId = Number(formData.get("group_id") || 0);
  if (userCan(user, "tickets.reply")) patch.assigneeId = Number(formData.get("assignee_id") || 0);
  const result = setTicketFields(user, id, patch);
  if (!result.ok) back(`/admin/tickets/${id}`, result.message);
  audit(user.email, "ticket.update", String(id));
  redirect(`/admin/tickets/${id}`);
}

export async function saveRoutingGroup(formData: FormData) {
  const user = await requirePermission("tickets.manage");
  const result = saveTicketGroup(Number(formData.get("id") || 0), String(formData.get("name") || ""), String(formData.get("description") || ""));
  if (!result.ok) back("/admin/tickets/settings?tab=groups", result.message || "That group could not be saved.");
  audit(user.email, "ticket.group", String(result.id));
  redirect(`/admin/tickets/settings?tab=groups&group=${result.id}&saved=1`);
}

export async function saveRoutingMembers(formData: FormData) {
  const user = await requirePermission("tickets.manage");
  const groupId = Number(formData.get("group_id") || 0);
  const result = saveGroupMembers(groupId, formData.getAll("user_id").map((item) => Number(item)));
  if (!result.ok) back("/admin/tickets/settings?tab=groups", result.message);
  audit(user.email, "ticket.members", String(groupId));
  redirect(`/admin/tickets/settings?tab=groups&group=${groupId}&saved=1`);
}

export async function saveRoutingTopic(formData: FormData) {
  const user = await requirePermission("tickets.manage");
  const result = saveTopic(Number(formData.get("id") || 0), String(formData.get("name") || ""), Number(formData.get("group_id") || 0), formData.get("enabled") === "on");
  if (!result.ok) back("/admin/tickets/settings?tab=topics", result.message || "That topic could not be saved.");
  audit(user.email, "ticket.topic", String(formData.get("name") || ""));
  redirect(`/admin/tickets/settings?tab=topics&topic=${result.id || ""}&saved=1`);
}

export async function saveOutboundMail(formData: FormData) {
  const user = await requirePermission("tickets.manage");
  const result = saveMail({
    host: String(formData.get("smtp_host") || ""),
    port: Number(formData.get("smtp_port") || 587),
    user: String(formData.get("smtp_user") || ""),
    pass: String(formData.get("smtp_pass") || ""),
    from: String(formData.get("smtp_from") || ""),
    secure: formData.get("smtp_secure") === "on",
  });
  audit(user.email, "ticket.mail", result.ok ? "saved" : "failed");
  redirect("/admin/tickets/settings?tab=outgoing&saved=1");
}

function mailTestResult(to: string, message: string, ok: boolean): never {
  const query = new URLSearchParams();
  if (to) query.set("to", to);
  if (ok) {
    query.set("sent", "1");
    if (message && message !== "Email sent.") query.set("notice", message);
  } else query.set("test", message.slice(0, 500));
  query.set("tab", "outgoing");
  redirect(`/admin/tickets/settings?${query.toString()}#test-email`);
}

export async function sendTestMail(formData: FormData) {
  const user = await requirePermission("tickets.manage");
  const to = String(formData.get("to") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) mailTestResult(to, "Enter an email address for the test.", false);
  const { sendMail } = await import("@/lib/smtp");
  const { recordFailure } = await import("@/lib/failure-log");
  const settings = mailSettings();
  if (!settings?.smtp_host || !settings.smtp_from) {
    const detail = "Outgoing email is not set up, so the test was not sent.";
    recordFailure({ area: "email", userId: user.id, subject: to, detail });
    mailTestResult(to, detail, false);
  }
  const result = await sendMail({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    user: settings.smtp_user,
    pass: settings.smtp_pass,
    secure: settings.smtp_secure === 1,
    from: settings.smtp_from,
    to: [to],
    subject: "SautiCall test email",
    text: "This is a test from SautiCall. Account confirmation emails use this same outgoing mail.",
    messageId: `sc-test-${Date.now()}@sauticall`,
  });
  if (!result.ok) {
    recordFailure({ area: "email", userId: user.id, subject: to, detail: result.message });
    mailTestResult(to, result.message, false);
  }
  audit(user.email, "ticket.mail", "test");
  mailTestResult(to, result.message, true);
}

export async function rotateMailSecret() {
  const user = await requirePermission("tickets.manage");
  const secret = rotateInboundSecret();
  audit(user.email, "ticket.mail", "secret");
  return { secret };
}

export async function tryInboundMail(formData: FormData) {
  const user = await requirePermission("tickets.manage");
  const parsed = parseMailPayload({
    from: String(formData.get("from") || ""),
    subject: String(formData.get("subject") || ""),
    text: String(formData.get("text") || ""),
    messageId: `sample-${Date.now()}@sauticall.test`,
  });
  if (!parsed) back("/admin/tickets/settings?tab=diagnostics", "Use an email address in From.");
  const result = await receiveMail(parsed);
  audit(user.email, "ticket.inbound.sample", String(result.id || ""));
  if (!result.ok) back("/admin/tickets/settings?tab=diagnostics", result.message);
  redirect(`/admin/tickets/${result.id}`);
}

export async function saveFaq(formData: FormData) {
  const user = await requirePermission("blog.manage");
  const id = Number(formData.get("id") || 0);
  const title = String(formData.get("title") || "").trim().slice(0, 160);
  const excerpt = String(formData.get("excerpt") || "").trim().slice(0, 240);
  const body = String(formData.get("body") || "").trim().slice(0, 40000);
  const published = formData.get("published") === "on" ? 1 : 0;
  if (!title || !body) back(id ? `/admin/faq/${id}` : "/admin/faq/new", "A title and article are required.");
  const requested = slugify(String(formData.get("slug") || title));
  let slug = requested;
  let extra = 2;
  while (true) {
    const clash = getDb().prepare("SELECT id FROM faq_posts WHERE slug = ? AND id != ?").get(slug, id) as { id: number } | undefined;
    if (!clash) break;
    slug = `${requested}-${extra}`;
    extra += 1;
  }
  const now = new Date().toISOString();
  if (id) {
    const existing = getDb().prepare("SELECT id FROM faq_posts WHERE id = ?").get(id);
    if (!existing) back("/admin/faq", "That article was not found.");
    getDb().prepare("UPDATE faq_posts SET slug = ?, title = ?, excerpt = ?, body = ?, published = ?, updated_at = ? WHERE id = ?").run(slug, title, excerpt, body, published, now, id);
    audit(user.email, "faq.update", slug);
    revalidatePath("/faq");
    revalidatePath(`/faq/${slug}`);
    redirect(`/admin/faq/${id}`);
  }
  const info = getDb()
    .prepare("INSERT INTO faq_posts (slug, title, excerpt, body, published, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(slug, title, excerpt, body, published, user.name, now, now);
  audit(user.email, "faq.create", slug);
  revalidatePath("/faq");
  redirect(`/admin/faq/${Number(info.lastInsertRowid)}`);
}

export async function deleteFaq(formData: FormData) {
  const user = await requirePermission("blog.manage");
  const id = Number(formData.get("id") || 0);
  const row = getDb().prepare("SELECT slug FROM faq_posts WHERE id = ?").get(id) as { slug: string } | undefined;
  if (row) {
    getDb().prepare("DELETE FROM faq_posts WHERE id = ?").run(id);
    audit(user.email, "faq.delete", row.slug);
    revalidatePath("/faq");
    revalidatePath(`/faq/${row.slug}`);
  }
  redirect("/admin/faq");
}
