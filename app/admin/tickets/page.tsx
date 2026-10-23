import Link from "next/link";
import { requireAnyPermission } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";
import { listStaffTickets, statusLabel } from "@/lib/tickets";

export default async function TicketsPage() {
  const user = await requireAnyPermission(["tickets.view", "tickets.view_all", "tickets.reply"]);
  const tickets = listStaffTickets(user);
  const groups = getDb().prepare("SELECT id, name FROM ticket_groups").all() as { id: number; name: string }[];
  const groupName = (id: number | null) => groups.find((group) => group.id === id)?.name || "Unassigned";
  return (
    <>
      <span className="eyebrow">Support</span>
      <h2>Tickets</h2>
      <p>You see tickets for the groups you belong to. An access level with every ticket shows the full list. Customers open tickets from their account, and email sent to the inbound address lands here too.</p>
      {tickets.length === 0 ? <p>No tickets for your groups yet.</p> : null}
      {tickets.map((ticket) => (
        <article key={ticket.id} className="feature-card" style={{ marginBottom: 12 }}>
          <h3><Link href={`/admin/tickets/${ticket.id}`}>SC-{ticket.id} · {ticket.subject}</Link></h3>
          <p>{ticket.requester_name} · {ticket.requester_email}</p>
          <p>{statusLabel(ticket.status)} · {groupName(ticket.group_id)} · {ticket.priority} · {formatWhen(ticket.updated_at)}</p>
        </article>
      ))}
    </>
  );
}
