import { openTicket } from "../../desk-actions";
import { guardAccount } from "@/lib/guard";
import { getDb } from "@/lib/db";
import { customerMessage } from "@/lib/customer-message";
import { loadSite } from "@/lib/site";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const topics = getDb().prepare("SELECT id, name FROM ticket_topics WHERE enabled = 1 ORDER BY name").all() as { id: number; name: string }[];
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>{text("ticketsNew")}</h1>
        <p>{text("ticketsBody")}</p>
      </header>
            {params.error ? <p className="form-feedback form-error" role="alert">{customerMessage(params.error, "The ticket could not be sent. Please try again, or contact support.")}</p> : null}
            {topics.length === 0 ? <p>{text("ticketsClosed")}</p> : (
              <form className="contact-form" action={openTicket}>
                <label>{text("ticketsTopic")}
                  <select name="topic_id" required defaultValue="">
                    <option value="" disabled>Choose</option>
                    {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                  </select>
                </label>
                <label>{text("ticketsSubject")} <input name="subject" required /></label>
                <label>{text("ticketsPriority")}
                  <select name="priority" defaultValue="normal">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>{text("ticketsMessage")} <textarea name="body" rows={6} required /></label>
                <button className="btn btn-primary" type="submit">{text("ticketsSend")}</button>
              </form>
            )}
    </div>
  );
}
