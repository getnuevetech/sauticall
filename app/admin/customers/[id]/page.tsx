import Link from "next/link";
import { notFound } from "next/navigation";
import { provisionVoipClient, saveCustomerUser } from "../../desk-actions";
import { userCan } from "@/lib/access";
import { requirePermission } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";
import { paidPlan } from "@/lib/pbx";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requirePermission("users.customers");
  const { id } = await params;
  const query = await searchParams;
  const person = getDb().prepare("SELECT id, name, email, disabled, created_at FROM users WHERE id = ? AND role = 'customer'").get(Number(id)) as {
    id: number;
    name: string;
    email: string;
    disabled: number;
    created_at: string;
  } | undefined;
  if (!person) notFound();
  const plan = paidPlan(person.id);
  const lines = getDb().prepare("SELECT did, status, e911_status FROM phone_lines WHERE user_id = ? ORDER BY id").all(person.id) as { did: string; status: string; e911_status: string }[];
  const voipClient = getDb().prepare("SELECT client_id, email, last_message FROM voip_clients WHERE user_id = ?").get(person.id) as { client_id: string; email: string; last_message: string } | undefined;
  const lineAccount = getDb().prepare("SELECT account FROM voip_subaccounts WHERE user_id = ?").get(person.id) as { account: string } | undefined;
  const people = getDb().prepare("SELECT number, first_name, last_name, email, status FROM pbx_extensions WHERE user_id = ? ORDER BY number").all(person.id) as { number: string; first_name: string; last_name: string; email: string; status: string }[];
  const seeTickets = userCan(actor, "tickets.view") || userCan(actor, "tickets.view_all") || userCan(actor, "tickets.reply");
  return (
    <>
      <span className="eyebrow">Customers</span>
      <h2>{person.name}</h2>
      <p><Link href="/admin/customers">All customers</Link> · Joined {formatWhen(person.created_at)} · {plan ? plan.name : "No paid plan"}</p>
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
      <form className="contact-form" action={saveCustomerUser}>
        <input type="hidden" name="id" value={person.id} />
        <div className="form-grid">
          <label>Name <input name="name" defaultValue={person.name} required /></label>
          <label>Email <input name="email" type="email" defaultValue={person.email} required /></label>
        </div>
        <label>New password <input name="password" type="password" minLength={10} placeholder="Leave blank to keep the current password" /></label>
        <label className="check-option"><input type="checkbox" name="disabled" defaultChecked={Boolean(person.disabled)} /> Turn off sign-in</label>
        <button className="btn btn-primary" type="submit">Save customer</button>
      </form>
      <div className="desk">
        <section className="desk-card">
          <h3>People on the phone system</h3>
          {people.length === 0 ? <p>No extensions yet.</p> : (
            <ul className="desk-lines">{people.map((item) => <li key={item.number}>{item.number} · {item.first_name} {item.last_name} · {item.email} · {item.status}</li>)}</ul>
          )}
        </section>
        <section className="desk-card">
          <h3>VoIP.ms client</h3>
          <p>{voipClient?.client_id ? `Client ${voipClient.client_id}` : "No client yet."}{lineAccount?.account ? ` · Line ${lineAccount.account}` : ""}</p>
          {voipClient?.email ? <p>{voipClient.email}</p> : null}
          {voipClient?.last_message ? <p>{voipClient.last_message}</p> : null}
          <p>This client is created when the customer signs up. Customers do not see it. Their numbers are bought onto the line account linked to this client.</p>
          <form action={provisionVoipClient}><input type="hidden" name="id" value={person.id} /><button className="btn btn-secondary" type="submit">{voipClient?.client_id ? "Refresh the VoIP.ms client" : "Create the VoIP.ms client"}</button></form>
        </section>
        <section className="desk-card">
          <h3>Numbers</h3>
          {lines.length === 0 ? <p>No purchased numbers.</p> : (
            <ul className="desk-lines">{lines.map((line) => <li key={line.did}>{line.did} · {line.status} · emergency {line.e911_status}</li>)}</ul>
          )}
        </section>
      </div>
      {seeTickets ? <p><Link href={`/admin/tickets?q=${encodeURIComponent(person.email)}`}>Open this customer's tickets</Link></p> : null}
    </>
  );
}
