import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { guardAccount } from "@/lib/guard";
import { formatWhen } from "@/lib/format-when";
import { loadSite } from "@/lib/site";
import { customerTickets, statusLabel } from "@/lib/tickets";

export default async function AccountTicketsPage() {
  const user = await guardAccount();
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const tickets = customerTickets(user.id);
  return (
    <Frame pathname="/account/tickets">
      <main>
        <AccountHero eyebrow="SUPPORT" title={text("ticketsTitle")} body={text("ticketsBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/tickets" />
            <p><Link className="btn btn-primary" href="/account/tickets/new">{text("ticketsNew")}</Link></p>
            {tickets.length === 0 ? <p>{text("ticketsEmpty")}</p> : null}
            {tickets.map((ticket) => (
              <article key={ticket.id} className="feature-card" style={{ marginBottom: 12 }}>
                <h3><Link href={`/account/tickets/${ticket.id}`}>SC-{ticket.id} · {ticket.subject}</Link></h3>
                <p>{statusLabel(ticket.status)} · {formatWhen(ticket.updated_at)}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </Frame>
  );
}
