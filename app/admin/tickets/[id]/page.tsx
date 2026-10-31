import Link from "next/link";
import { notFound } from "next/navigation";
import { replyTicket, updateTicket } from "../../desk-actions";
import { requireAnyPermission, userCan } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";
import { TICKET_STATUSES, staffTicket, statusLabel } from "@/lib/tickets";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireAnyPermission(["tickets.view", "tickets.view_all", "tickets.reply", "tickets.manage"]);
  const { id } = await params;
  const query = await searchParams;
  const found = staffTicket(user, Number(id));
  if (!found) notFound();
  const { ticket, messages } = found;
  const groups = getDb().prepare("SELECT id, name FROM ticket_groups ORDER BY name").all() as { id: number; name: string }[];
  const staff = getDb().prepare("SELECT id, name FROM users WHERE role IN ('staff', 'super_admin') ORDER BY name").all() as { id: number; name: string }[];
  const topic = ticket.topic_id ? getDb().prepare("SELECT name FROM ticket_topics WHERE id = ?").get(ticket.topic_id) as { name: string } | undefined : undefined;
  const canReply = userCan(user, "tickets.reply");
  const canRoute = userCan(user, "tickets.manage") || userCan(user, "tickets.view_all");
  const canEdit = canReply || canRoute;
  const customer = ticket.user_id ? getDb().prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'").get(ticket.user_id) as { id: number } | undefined : undefined;
  return (
    <>
      <span className="eyebrow">Support</span>
      <p><Link href="/admin/tickets">Ticket desk</Link></p>
      <h2>SC-{ticket.id} · {ticket.subject}</h2>
      <p>{statusLabel(ticket.status)} · {ticket.priority} priority · opened {formatWhen(ticket.created_at)} · updated {formatWhen(ticket.updated_at)}</p>
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
      <div className="desk">
        <section>
          <div className="desk-thread">
            {messages.map((message) => {
              const fromCustomer = message.author_email.toLowerCase() === ticket.requester_email.toLowerCase() && message.kind !== "note";
              const kind = message.kind === "note" ? "note" : fromCustomer ? "customer" : "staff";
              return (
                <article key={message.id} className={`desk-msg ${kind}`}>
                  <h3>{message.author_name}{message.kind === "note" ? " · internal note" : fromCustomer ? " · customer" : " · support"}{message.source === "email" ? " · email" : ""}</h3>
                  <p>{formatWhen(message.created_at)} · {message.author_email}</p>
                  <p className="desk-body">{message.body}</p>
                </article>
              );
            })}
          </div>
          {canReply ? (
            <form className="contact-form" action={replyTicket}>
              <input type="hidden" name="id" value={ticket.id} />
              <label>Reply to the customer <textarea name="body" rows={5} required placeholder="This is sent to the customer unless you mark it as an internal note." /></label>
              <label className="check-option"><input type="checkbox" name="kind" value="note" /> Internal note. The customer does not see it and it is not emailed.</label>
              <button className="btn btn-primary" type="submit">Send</button>
            </form>
          ) : null}
        </section>
        <aside className="desk-card">
          <h3>Customer</h3>
          <p><b>{ticket.requester_name}</b><br />{ticket.requester_email}</p>
          <p>{topic ? `Topic: ${topic.name}` : "No topic"}</p>
          {customer && userCan(user, "users.customers") ? <p><Link href={`/admin/customers/${customer.id}`}>Open customer account</Link></p> : null}
          {canEdit ? (
            <form action={updateTicket} className="desk-properties">
              <input type="hidden" name="id" value={ticket.id} />
              {canReply || userCan(user, "tickets.view_all") ? (
                <>
                  <label>Status
                    <select name="status" defaultValue={ticket.status}>
                      {TICKET_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>Priority
                    <select name="priority" defaultValue={ticket.priority}>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </>
              ) : null}
              {canRoute ? (
                <label>Team
                  <select name="group_id" defaultValue={String(ticket.group_id || "")}>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
              ) : null}
              {canReply ? (
                <label>Assignee
                  <select name="assignee_id" defaultValue={String(ticket.assignee_id || "0")}>
                    <option value="0">Unassigned</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
              ) : null}
              <button className="btn btn-secondary" type="submit">Save ticket</button>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}
