import Link from "next/link";
import { requireAnyPermission, userCan } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";
import { listStaffTickets, statusLabel } from "@/lib/tickets";

const QUEUES = [
  ["active", "Active"],
  ["open", "Open"],
  ["waiting_on_us", "Waiting on us"],
  ["waiting_on_customer", "Waiting on the customer"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
  ["all", "All"],
] as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ queue?: string; q?: string; group?: string; mine?: string }> }) {
  const user = await requireAnyPermission(["tickets.view", "tickets.view_all", "tickets.reply"]);
  const query = await searchParams;
  const queue = QUEUES.some(([key]) => key === query.queue) ? query.queue || "active" : "active";
  const search = query.q?.trim() || "";
  const groupFilter = Number(query.group || 0);
  const mine = query.mine === "1";
  const tickets = listStaffTickets(user);
  const canCreate = userCan(user, "tickets.reply") || userCan(user, "tickets.view_all") || userCan(user, "tickets.manage");
  const groups = getDb().prepare("SELECT id, name FROM ticket_groups ORDER BY name").all() as { id: number; name: string }[];
  const topics = getDb().prepare("SELECT id, name FROM ticket_topics").all() as { id: number; name: string }[];
  const topicName = new Map(topics.map((topic) => [topic.id, topic.name]));
  const staff = getDb().prepare("SELECT id, name FROM users WHERE role IN ('staff', 'super_admin')").all() as { id: number; name: string }[];
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const staffName = new Map(staff.map((person) => [person.id, person.name]));
  const counts = Object.fromEntries(QUEUES.map(([key]) => [key, 0])) as Record<string, number>;
  counts.all = tickets.length;
  for (const ticket of tickets) {
    counts[ticket.status] = (counts[ticket.status] || 0) + 1;
    if (ticket.status !== "resolved" && ticket.status !== "closed") counts.active += 1;
  }
  const needle = search.toLowerCase();
  const visible = tickets.filter((ticket) => {
    if (queue === "active" && (ticket.status === "resolved" || ticket.status === "closed")) return false;
    if (queue !== "active" && queue !== "all" && ticket.status !== queue) return false;
    if (groupFilter && ticket.group_id !== groupFilter) return false;
    if (mine && ticket.assignee_id !== user.id) return false;
    if (!needle) return true;
    const haystack = `sc-${ticket.id} ${ticket.subject} ${ticket.requester_name} ${ticket.requester_email}`.toLowerCase();
    return haystack.includes(needle);
  });
  const hrefFor = (nextQueue: string) => {
    const params = new URLSearchParams();
    if (nextQueue !== "active") params.set("queue", nextQueue);
    if (search) params.set("q", search);
    if (groupFilter) params.set("group", String(groupFilter));
    if (mine) params.set("mine", "1");
    const text = params.toString();
    return text ? `/admin/tickets?${text}` : "/admin/tickets";
  };
  return (
    <>
      <span className="eyebrow">Support</span>
      <h2>Ticket desk</h2>
      {canCreate ? <p><Link className="btn btn-primary" href="/admin/tickets/new">New ticket</Link></p> : null}
      <p>Work the queue for your groups. Open a ticket to reply, leave an internal note, change priority, or move it to another team. Customers see public replies in their account, and email replies stay on the same ticket.</p>
      <nav className="desk-queues" aria-label="Ticket queues">
        {QUEUES.map(([key, label]) => (
          <Link key={key} href={hrefFor(key)} data-current={queue === key ? "true" : undefined}>{label} <b>{counts[key] || 0}</b></Link>
        ))}
      </nav>
      <form className="desk-filters" method="get">
        {queue !== "active" ? <input type="hidden" name="queue" value={queue} /> : null}
        <label>Search <input name="q" defaultValue={search} placeholder="Subject, customer, or SC number" /></label>
        <label>Queue
          <select name="group" defaultValue={groupFilter ? String(groupFilter) : ""}>
            <option value="">Every team</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <label className="check-option"><input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Assigned to me</label>
        <button className="btn btn-secondary" type="submit">Apply</button>
      </form>
      {visible.length === 0 ? <p>No tickets in this queue.</p> : (
        <div className="desk-table-wrap">
          <table className="desk-table">
            <thead>
              <tr><th>Ticket</th><th>Customer</th><th>Category</th><th>Team</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {visible.map((ticket) => (
                <tr key={ticket.id}>
                  <td><Link href={`/admin/tickets/${ticket.id}`}><b>SC-{ticket.id}</b> {ticket.subject}</Link></td>
                  <td>{ticket.requester_name}<span>{ticket.requester_email}</span></td>
                  <td>{topicName.get(ticket.topic_id || 0) || "None"}</td>
                  <td>{groupName.get(ticket.group_id || 0) || "Unassigned"}</td>
                  <td>{staffName.get(ticket.assignee_id || 0) || "Unassigned"}</td>
                  <td><span className={`desk-chip ${ticket.status}`}>{statusLabel(ticket.status)}</span></td>
                  <td><span className={`desk-chip priority-${ticket.priority}`}>{ticket.priority}</span></td>
                  <td>{formatWhen(ticket.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
