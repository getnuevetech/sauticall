import Link from "next/link";
import { CustomerEmailPicker } from "@/components/admin/CustomerEmailPicker";
import { createAdminTicket } from "../../desk-actions";
import { requireAnyPermission } from "@/lib/access";
import { getDb } from "@/lib/db";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAnyPermission(["tickets.reply", "tickets.view_all", "tickets.manage"]);
  const params = await searchParams;
  const topics = getDb().prepare("SELECT id, name FROM ticket_topics WHERE enabled = 1 ORDER BY name").all() as { id: number; name: string }[];
  return (
    <>
      <span className="eyebrow">Support</span>
      <p><Link href="/admin/tickets">Ticket desk</Link></p>
      <h2>New ticket</h2>
      <p>Search a registered customer by email, give the case a title, and choose what it is about. The ticket number is assigned when you save it, in the form SC-1.</p>
      {params.error ? <p className="form-feedback form-error" role="alert">{params.error}</p> : null}
      {topics.length === 0 ? <p>Add a category under Queues and email before opening a ticket.</p> : (
        <form className="contact-form" action={createAdminTicket}>
          <CustomerEmailPicker />
          <label>Title <input name="subject" required maxLength={160} placeholder="Cannot hear callers" /></label>
          <label>What this ticket is about
            <select name="topic_id" required defaultValue="">
              <option value="" disabled>Choose a category</option>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
          <label>What happened <textarea name="body" rows={6} required placeholder="The customer will see this on the ticket." /></label>
          <button className="btn btn-primary" type="submit">Create ticket</button>
        </form>
      )}
    </>
  );
}
