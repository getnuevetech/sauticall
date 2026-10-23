import crypto from "crypto";
import { userCan, userPermissions } from "./access";
import { getDb } from "./db";
import { normalizeMessageId, ticketIdFromText, type ParsedMail } from "./mail-parse";
import { sendMail } from "./smtp";

export const TICKET_STATUSES = [
  ["open", "Open"],
  ["waiting_on_us", "Waiting on us"],
  ["waiting_on_customer", "Waiting on the customer"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const;

export type TicketRow = {
  id: number;
  user_id: number | null;
  requester_email: string;
  requester_name: string;
  topic_id: number | null;
  group_id: number | null;
  subject: string;
  status: string;
  priority: string;
  assignee_id: number | null;
  created_at: string;
  updated_at: string;
};

export type TicketMessage = {
  id: number;
  ticket_id: number;
  author_id: number | null;
  author_email: string;
  author_name: string;
  body: string;
  kind: string;
  source: string;
  created_at: string;
};

type MailSettings = {
  inbound_secret: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  smtp_secure: number;
};

export function statusLabel(status: string) {
  return TICKET_STATUSES.find((item) => item[0] === status)?.[1] || status;
}

export function mailSettings() {
  return getDb().prepare("SELECT inbound_secret, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure FROM mail_settings WHERE id = 1").get() as MailSettings;
}

function secretMatches(given: string, expected: string) {
  if (!given || !expected) return false;
  const left = crypto.createHash("sha256").update(given).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

export function inboundAuthorized(given: string) {
  return secretMatches(given, mailSettings()?.inbound_secret || "");
}

function staffCanSee(user: { id: number; role: string }, ticket: { group_id: number | null; assignee_id: number | null }) {
  if (user.role === "super_admin") return true;
  const permissions = userPermissions(user.id);
  if (permissions.includes("tickets.view_all")) return true;
  if (!permissions.includes("tickets.view") && !permissions.includes("tickets.reply")) return false;
  if (ticket.assignee_id === user.id) return true;
  if (!ticket.group_id) return false;
  const member = getDb().prepare("SELECT 1 AS ok FROM ticket_group_members WHERE group_id = ? AND user_id = ?").get(ticket.group_id, user.id) as { ok: number } | undefined;
  return Boolean(member);
}

export function listStaffTickets(user: { id: number; role: string }) {
  const permissions = user.role === "super_admin" ? ["tickets.view_all"] : userPermissions(user.id);
  const all = user.role === "super_admin" || permissions.includes("tickets.view_all");
  if (all) {
    return getDb().prepare("SELECT * FROM tickets ORDER BY updated_at DESC LIMIT 200").all() as TicketRow[];
  }
  return getDb()
    .prepare(
      `SELECT * FROM tickets t
       WHERE t.group_id IN (SELECT group_id FROM ticket_group_members WHERE user_id = ?) OR t.assignee_id = ?
       ORDER BY t.updated_at DESC LIMIT 200`,
    )
    .all(user.id, user.id) as TicketRow[];
}

export function staffTicket(user: { id: number; role: string }, id: number) {
  const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | undefined;
  if (!ticket || !staffCanSee(user, ticket)) return null;
  const messages = getDb().prepare("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at, id").all(id) as TicketMessage[];
  return { ticket, messages };
}

function rememberMail(messageId: string, ticketId: number, direction: string) {
  if (!messageId) return;
  getDb()
    .prepare("INSERT INTO ticket_mail (message_id, ticket_id, direction, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(message_id) DO NOTHING")
    .run(messageId, ticketId, direction, new Date().toISOString());
}

function addMessage(input: { ticketId: number; authorId: number | null; email: string; name: string; body: string; kind: "public" | "note"; source: "web" | "email" }) {
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO ticket_messages (ticket_id, author_id, author_email, author_name, body, kind, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(input.ticketId, input.authorId, input.email, input.name, input.body.slice(0, 20000), input.kind, input.source, now);
  const status = input.kind === "note" ? undefined : input.source === "web" && input.authorId ? "waiting_on_customer" : "open";
  if (status) getDb().prepare("UPDATE tickets SET status = CASE WHEN status = 'closed' THEN 'open' ELSE ? END, updated_at = ? WHERE id = ?").run(status, now, input.ticketId);
  else getDb().prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(now, input.ticketId);
}

async function deliver(ticket: TicketRow, body: string, recipients: string[], inReplyTo = "") {
  const settings = mailSettings();
  if (!settings?.smtp_host || !settings.smtp_from || recipients.length === 0) return "Saved. Outgoing email is not set up, so nobody was emailed.";
  const messageId = `sc-${ticket.id}-${crypto.randomBytes(8).toString("hex")}@sauticall`;
  const result = await sendMail({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    user: settings.smtp_user,
    pass: settings.smtp_pass,
    secure: settings.smtp_secure === 1,
    from: settings.smtp_from,
    to: recipients,
    subject: `Re: ${ticket.subject} [SC-${ticket.id}]`,
    text: `${body}\n\nReply to this email to update ticket SC-${ticket.id}.`,
    messageId,
    inReplyTo,
  });
  if (result.ok) rememberMail(messageId, ticket.id, "out");
  return result.ok ? "Saved and emailed." : `Saved. Email was not sent: ${result.message}`;
}

function groupEmails(groupId: number | null) {
  if (!groupId) return [];
  const rows = getDb()
    .prepare(
      `SELECT u.email FROM ticket_group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? AND u.role IN ('staff', 'super_admin')`,
    )
    .all(groupId) as { email: string }[];
  return rows.map((row) => row.email).slice(0, 20);
}

function lastInboundId(ticketId: number) {
  const row = getDb().prepare("SELECT message_id FROM ticket_mail WHERE ticket_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1").get(ticketId) as { message_id: string } | undefined;
  return row?.message_id || "";
}

export async function createCustomerTicket(user: { id: number; email: string; name: string }, input: { topicId: number; subject: string; body: string; priority: string }) {
  const topic = getDb().prepare("SELECT id, group_id, name FROM ticket_topics WHERE id = ? AND enabled = 1").get(input.topicId) as { id: number; group_id: number; name: string } | undefined;
  if (!topic) return { ok: false, message: "Choose a topic." };
  const subject = input.subject.trim().slice(0, 160);
  const body = input.body.trim().slice(0, 20000);
  if (!subject || !body) return { ok: false, message: "Add a subject and a message." };
  const priority = input.priority === "low" || input.priority === "high" ? input.priority : "normal";
  const now = new Date().toISOString();
  const info = getDb()
    .prepare("INSERT INTO tickets (user_id, requester_email, requester_name, topic_id, group_id, subject, status, priority, assignee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?)")
    .run(user.id, user.email, user.name, topic.id, topic.group_id, subject, priority, now, now);
  const id = Number(info.lastInsertRowid);
  addMessage({ ticketId: id, authorId: user.id, email: user.email, name: user.name, body, kind: "public", source: "web" });
  getDb().prepare("UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?").run(now, id);
  const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow;
  const notice = await deliver(ticket, `${user.name} opened this ticket under ${topic.name}.\n\n${body}`, groupEmails(topic.group_id));
  return { ok: true, id, message: notice };
}

export function customerTickets(userId: number) {
  return getDb().prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as TicketRow[];
}

export function customerTicket(userId: number, id: number) {
  const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ? AND user_id = ?").get(id, userId) as TicketRow | undefined;
  if (!ticket) return null;
  const messages = getDb().prepare("SELECT * FROM ticket_messages WHERE ticket_id = ? AND kind = 'public' ORDER BY created_at, id").all(id) as TicketMessage[];
  return { ticket, messages };
}

export async function customerReply(user: { id: number; email: string; name: string }, ticketId: number, body: string) {
  const found = customerTicket(user.id, ticketId);
  if (!found) return { ok: false, message: "That ticket was not found." };
  const text = body.trim().slice(0, 20000);
  if (!text) return { ok: false, message: "Write a reply." };
  if (found.ticket.status === "closed") return { ok: false, message: "This ticket is closed. Open a new one if you still need help." };
  addMessage({ ticketId, authorId: user.id, email: user.email, name: user.name, body: text, kind: "public", source: "web" });
  getDb().prepare("UPDATE tickets SET status = 'open' WHERE id = ?").run(ticketId);
  const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TicketRow;
  const notice = await deliver(ticket, text, groupEmails(ticket.group_id), lastInboundId(ticketId));
  return { ok: true, message: notice };
}

export async function staffReply(user: { id: number; email: string; name: string; role: string }, ticketId: number, body: string, kind: "public" | "note") {
  if (user.role !== "super_admin" && !userCan(user, "tickets.reply")) return { ok: false, message: "You cannot reply to tickets." };
  const found = staffTicket(user, ticketId);
  if (!found) return { ok: false, message: "That ticket was not found." };
  const text = body.trim().slice(0, 20000);
  if (!text) return { ok: false, message: "Write a reply." };
  const note = kind === "note";
  addMessage({ ticketId, authorId: user.id, email: user.email, name: user.name, body: text, kind: note ? "note" : "public", source: "web" });
  if (!note) getDb().prepare("UPDATE tickets SET status = 'waiting_on_customer', assignee_id = COALESCE(assignee_id, ?) WHERE id = ?").run(user.id, ticketId);
  const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TicketRow;
  if (note) return { ok: true, message: "Note saved. The customer does not see it." };
  const notice = await deliver(ticket, text, [ticket.requester_email], lastInboundId(ticketId));
  return { ok: true, message: notice };
}

export function setTicketFields(user: { id: number; role: string }, ticketId: number, input: { status?: string; priority?: string; groupId?: number; assigneeId?: number }) {
  const found = staffTicket(user, ticketId);
  if (!found) return { ok: false, message: "That ticket was not found." };
  if (input.priority) {
    if (input.priority !== "low" && input.priority !== "normal" && input.priority !== "high") return { ok: false, message: "Unknown priority." };
    if (user.role !== "super_admin" && !userCan(user, "tickets.reply") && !userCan(user, "tickets.view_all")) return { ok: false, message: "You cannot change this ticket." };
    getDb().prepare("UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ?").run(input.priority, new Date().toISOString(), ticketId);
  }
  if (input.status) {
    if (!TICKET_STATUSES.some((item) => item[0] === input.status)) return { ok: false, message: "Unknown status." };
    if (user.role !== "super_admin" && !userCan(user, "tickets.reply") && !userCan(user, "tickets.view_all")) return { ok: false, message: "You cannot change this ticket." };
    getDb().prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(input.status, new Date().toISOString(), ticketId);
  }
  if (input.groupId) {
    if (user.role !== "super_admin" && !userCan(user, "tickets.manage") && !userCan(user, "tickets.view_all")) return { ok: false, message: "You cannot move this ticket." };
    const group = getDb().prepare("SELECT id FROM ticket_groups WHERE id = ?").get(input.groupId) as { id: number } | undefined;
    if (!group) return { ok: false, message: "That group was not found." };
    getDb().prepare("UPDATE tickets SET group_id = ?, updated_at = ? WHERE id = ?").run(group.id, new Date().toISOString(), ticketId);
  }
  if (input.assigneeId !== undefined) {
    if (user.role !== "super_admin" && !userCan(user, "tickets.reply")) return { ok: false, message: "You cannot assign this ticket." };
    if (input.assigneeId === 0) {
      getDb().prepare("UPDATE tickets SET assignee_id = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), ticketId);
    } else {
      const assignee = getDb().prepare("SELECT id FROM users WHERE id = ? AND role IN ('staff', 'super_admin')").get(input.assigneeId) as { id: number } | undefined;
      if (!assignee) return { ok: false, message: "Choose a staff member." };
      getDb().prepare("UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?").run(assignee.id, new Date().toISOString(), ticketId);
    }
  }
  return { ok: true, message: "Ticket updated." };
}

function findTicketId(mail: ParsedMail) {
  for (const reference of mail.referenceIds) {
    const row = getDb().prepare("SELECT ticket_id FROM ticket_mail WHERE message_id = ?").get(reference) as { ticket_id: number } | undefined;
    if (row) return row.ticket_id;
  }
  return ticketIdFromText(`${mail.subject}\n${mail.text}`);
}

export async function receiveMail(mail: ParsedMail) {
  if (mail.messageId) {
    const seen = getDb().prepare("SELECT ticket_id FROM ticket_mail WHERE message_id = ?").get(mail.messageId) as { ticket_id: number } | undefined;
    if (seen) return { ok: true, id: seen.ticket_id, duplicate: true, message: "Already received." };
  }
  const existingId = findTicketId(mail);
  const text = mail.text.trim() || "(No message body)";
  const name = mail.fromName || mail.fromEmail;
  if (existingId) {
    const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(existingId) as TicketRow | undefined;
    if (ticket) {
      const account = getDb().prepare("SELECT id FROM users WHERE email = ?").get(mail.fromEmail) as { id: number } | undefined;
      addMessage({ ticketId: ticket.id, authorId: account?.id ?? null, email: mail.fromEmail, name, body: text, kind: "public", source: "email" });
      if (ticket.status === "closed" || ticket.status === "resolved" || ticket.status === "waiting_on_customer") {
        getDb().prepare("UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?").run(new Date().toISOString(), ticket.id);
      }
      if (mail.messageId) rememberMail(mail.messageId, ticket.id, "in");
      const fresh = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(ticket.id) as TicketRow;
      if (mail.fromEmail !== ticket.requester_email) await deliver(fresh, `${name} replied by email.\n\n${text}`, groupEmails(ticket.group_id), mail.messageId);
      return { ok: true, id: ticket.id, duplicate: false, message: "Reply added to the ticket." };
    }
  }
  const topic = getDb().prepare("SELECT id, group_id FROM ticket_topics WHERE enabled = 1 ORDER BY CASE name WHEN 'General' THEN 0 ELSE 1 END, id LIMIT 1").get() as { id: number; group_id: number } | undefined;
  if (!topic) return { ok: false, message: "No ticket topic is set up." };
  const account = getDb().prepare("SELECT id, name FROM users WHERE email = ?").get(mail.fromEmail) as { id: number; name: string } | undefined;
  const now = new Date().toISOString();
  const subject = (mail.subject || text.slice(0, 80) || "Email request").slice(0, 160);
  const info = getDb()
    .prepare("INSERT INTO tickets (user_id, requester_email, requester_name, topic_id, group_id, subject, status, priority, assignee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 'normal', NULL, ?, ?)")
    .run(account?.id ?? null, mail.fromEmail, account?.name || name, topic.id, topic.group_id, subject, now, now);
  const id = Number(info.lastInsertRowid);
  addMessage({ ticketId: id, authorId: account?.id ?? null, email: mail.fromEmail, name: account?.name || name, body: text, kind: "public", source: "email" });
  if (mail.messageId) rememberMail(mail.messageId, id, "in");
  const ticket = getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow;
  await deliver(ticket, `${name} emailed a new request.\n\n${text}`, groupEmails(topic.group_id), mail.messageId);
  return { ok: true, id, duplicate: false, message: "Ticket created from email." };
}

export function saveTicketGroup(id: number, name: string, description: string) {
  const label = name.trim().slice(0, 80);
  if (!label) return { ok: false, message: "Give the group a name." };
  if (id) {
    const existing = getDb().prepare("SELECT id FROM ticket_groups WHERE id = ?").get(id);
    if (!existing) return { ok: false, message: "That group was not found." };
    getDb().prepare("UPDATE ticket_groups SET name = ?, description = ? WHERE id = ?").run(label, description.trim().slice(0, 240), id);
    return { ok: true, id };
  }
  const info = getDb().prepare("INSERT INTO ticket_groups (name, description) VALUES (?, ?)").run(label, description.trim().slice(0, 240));
  return { ok: true, id: Number(info.lastInsertRowid) };
}

export function saveGroupMembers(groupId: number, userIds: number[]) {
  const group = getDb().prepare("SELECT id FROM ticket_groups WHERE id = ?").get(groupId) as { id: number } | undefined;
  if (!group) return { ok: false, message: "That group was not found." };
  const ids = [...new Set(userIds.map((id) => Number(id)).filter((id) => id > 0))];
  const allowed = ids.length
    ? (getDb().prepare(`SELECT id FROM users WHERE role IN ('staff', 'super_admin') AND id IN (${ids.map(() => "?").join(",")})`).all(...ids) as { id: number }[])
    : [];
  getDb().prepare("DELETE FROM ticket_group_members WHERE group_id = ?").run(groupId);
  const insert = getDb().prepare("INSERT INTO ticket_group_members (group_id, user_id) VALUES (?, ?)");
  allowed.forEach((row) => insert.run(groupId, row.id));
  return { ok: true, message: "Group members saved." };
}

export function saveTopic(id: number, name: string, groupId: number, enabled: boolean) {
  const label = name.trim().slice(0, 80);
  const group = getDb().prepare("SELECT id FROM ticket_groups WHERE id = ?").get(groupId) as { id: number } | undefined;
  if (!label || !group) return { ok: false, message: "A topic needs a name and a group." };
  if (id) {
    getDb().prepare("UPDATE ticket_topics SET name = ?, group_id = ?, enabled = ? WHERE id = ?").run(label, group.id, enabled ? 1 : 0, id);
    return { ok: true };
  }
  getDb().prepare("INSERT INTO ticket_topics (name, group_id, enabled) VALUES (?, ?, ?)").run(label, group.id, enabled ? 1 : 0);
  return { ok: true };
}

export function saveMail(input: { host: string; port: number; user: string; pass: string; from: string; secure: boolean }) {
  const current = mailSettings();
  const pass = input.pass.trim() || current?.smtp_pass || "";
  getDb()
    .prepare("UPDATE mail_settings SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?, smtp_secure = ? WHERE id = 1")
    .run(input.host.trim().slice(0, 200), input.port || 587, input.user.trim().slice(0, 200), pass, input.from.trim().slice(0, 200), input.secure ? 1 : 0);
  return { ok: true, message: "Email settings saved." };
}

export function rotateInboundSecret() {
  const secret = crypto.randomBytes(24).toString("hex");
  getDb().prepare("UPDATE mail_settings SET inbound_secret = ? WHERE id = 1").run(secret);
  return secret;
}
