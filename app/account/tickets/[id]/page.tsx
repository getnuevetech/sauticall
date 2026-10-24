import { notFound } from "next/navigation";
import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { replyToTicket } from "../../desk-actions";
import { guardAccount } from "@/lib/guard";
import { formatWhen } from "@/lib/format-when";
import { loadSite } from "@/lib/site";
import { customerMessage } from "@/lib/customer-message";
import { customerTicket, statusLabel } from "@/lib/tickets";

export default async function AccountTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await guardAccount();
  const { id } = await params;
  const query = await searchParams;
  const found = customerTicket(user.id, Number(id));
  if (!found) notFound();
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  return (
    <Frame pathname="/account/tickets">
      <main>
        <AccountHero eyebrow={`SC-${found.ticket.id}`} title={found.ticket.subject} body={`${statusLabel(found.ticket.status)} · ${formatWhen(found.ticket.updated_at)}`} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/tickets" />
            {query.error ? <p className="form-feedback">{customerMessage(query.error, "The reply could not be sent. Please try again, or contact support.")}</p> : null}
            {query.saved ? <p className="form-feedback">{customerMessage(query.saved, "Saved.")}</p> : null}
            <div className="ticket-thread">
              {found.messages.map((message) => (
                <article key={message.id}>
                  <h3>{message.author_name}</h3>
                  <p>{formatWhen(message.created_at)}</p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
                </article>
              ))}
            </div>
            {found.ticket.status === "closed" ? <p>This ticket is closed.</p> : (
              <form className="contact-form" action={replyToTicket}>
                <input type="hidden" name="id" value={found.ticket.id} />
                <label>{text("ticketsReply")} <textarea name="body" rows={5} required /></label>
                <button className="btn btn-primary" type="submit">{text("ticketsReply")}</button>
              </form>
            )}
          </div>
        </section>
      </main>
    </Frame>
  );
}
