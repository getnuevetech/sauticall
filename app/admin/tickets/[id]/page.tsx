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
  const staff = getDb().prepare("SELECT id, name, email FROM users WHERE role IN ('staff', 'super_admin') ORDER BY name").all() as { id: number; name: string; email: string }[];
  const canReply = userCan(user, "tickets.reply");
  const canRoute = userCan(user, "tickets.manage") || userCan(user, "tickets.view_all");
  return (
    <>
      <span className="eyebrow">SC-{ticket.id}</span>
      <h2>{ticket.subject}</h2>
      <p>{ticket.requester_name} · {ticket.requester_email} · {statusLabel(ticket.status)} · {ticket.priority} · updated {formatWhen(ticket.updated_at)}</p>
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
      {canReply ? (
        <form className="contact-form" action={updateTicket} style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={ticket.id} />
          <input type="hidden" name="intent" value="status" />
          <label>Status
            <select name="status" defaultValue={ticket.status}>
              {TICKET_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">Update status</button>
        </form>
      ) : null}
      {canRoute ? (
        <form className="contact-form" action={updateTicket} style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={ticket.id} />
          <input type="hidden" name="intent" value="route" />
          <div className="form-grid">
            <label>Group
              <select name="group_id" defaultValue={String(ticket.group_id || "")}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label>Assignee
              <select name="assignee_id" defaultValue={String(ticket.assignee_id || "0")}>
                <option value="0">Nobody yet</option>
                {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
          </div>
          <button className="btn btn-secondary" type="submit">Save routing</button>
        </form>
      ) : null}
      <div className="ticket-thread">
        {messages.map((message) => (
          <article key={message.id} className={message.kind === "note" ? "note" : undefined}>
            <h3>{message.author_name}{message.kind === "note" ? " · internal note" : ""}{message.source === "email" ? " · email" : ""}</h3>
            <p>{formatWhen(message.created_at)} · {message.author_email}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
          </article>
        ))}
      </div>
      {canReply ? (
        <form className="contact-form" action={replyTicket}>
          <input type="hidden" name="id" value={ticket.id} />
          <label>Reply <textarea name="body" rows={5} required /></label>
          <label className="check-option"><input type="checkbox" name="kind" value="note" /> Internal note, hidden from the customer</label>
          <button className="btn btn-primary" type="submit">Send</button>
        </form>
      ) : null}
    </>
  );
}
