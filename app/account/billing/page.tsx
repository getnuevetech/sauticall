import Link from "next/link";
import { redirect } from "next/navigation";
import { guardAccount } from "@/lib/guard";
import { accountUsage } from "@/lib/account-usage";
import { chicagoDate, chicagoDay, invoiceNumber, money, usagePercent, wholeMoney } from "@/lib/account-display";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  if (params.plan) redirect(`/account/billing/plan?review=${encodeURIComponent(params.plan)}`);
  const usage = accountUsage(user.id);
  const plan = usage.plan;
  const percent = usagePercent(usage.usedMinutes, usage.included);
  const lastPaid = usage.planPayment;
  return (
    <div className="workspace-page" style={{ maxWidth: 1080 }}>
      <h1>Usage & billing</h1>
      <p>Your plan, minutes, and payments in one place.</p>
      <nav className="ws-tabs">
        <Link href="/account/billing" className="active">Overview</Link>
        <Link href="/account/billing/plan">Manage plan</Link>
        <a href="#invoices">Invoices</a>
        <a href="#payment">Payment methods</a>
      </nav>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      <div className="ws-grid-2">
        <section className="ws-card">
          <div className="ws-split"><span>Current plan</span>{plan ? <span className="ws-pill live">Active</span> : null}</div>
          <h2 style={{ marginTop: 8 }}>{plan ? plan.name : "No plan yet"}</h2>
          <p className="price">{plan ? <>{wholeMoney(plan.price)} <small>/ month</small></> : "Choose a plan to start service."}</p>
          {plan ? <p>Up to {plan.seats || 1} {plan.seats === 1 ? "person" : "people"} · {plan.includedMinutes.toLocaleString("en-US")} outbound minutes</p> : null}
          {usage.periodEnd ? <p>Next renewal: {chicagoDate(usage.periodEnd)}</p> : null}
          <p><Link className="ws-btn primary" href="/account/billing/plan">Manage plan</Link></p>
        </section>
        <section className="ws-card">
          <div className="ws-split"><h2>Outbound minutes</h2><span>{usage.periodStart ? `${chicagoDay(usage.periodStart)} – ${usage.periodEnd ? chicagoDay(usage.periodEnd) : "now"}` : "This period"}</span></div>
          <p className="price" style={{ fontSize: "1.6rem" }}>{usage.usedMinutes.toLocaleString("en-US")} / {usage.included.toLocaleString("en-US")} min used</p>
          <div className="ws-meter"><span style={{ width: `${percent}%` }} /></div>
          <div className="ws-split"><span>{usage.remaining.toLocaleString("en-US")} minutes remaining</span><span>{percent}%</span></div>
          {usage.periodEnd ? <p>Resets {chicagoDate(usage.periodEnd)}</p> : <p>Minutes appear here after a plan payment.</p>}
          <div className="ws-actions">
            <Link className="ws-btn ghost" href="/account/minutes">View usage</Link>
            <Link className="ws-btn ghost" href="/account/minutes">Buy extra minutes</Link>
          </div>
        </section>
      </div>
      <div className="ws-grid-3">
        <section className="ws-card"><span>Subscription</span><b>{plan ? money(plan.price) : money(0)}</b></section>
        <section className="ws-card"><span>Additional charges</span><b>{money(usage.extraCents / 100)}</b></section>
        <section className="ws-card"><span>Estimated next bill</span><b>{money(usage.renewalAmount)}</b><span>Taxes and any additional charges shown at checkout.</span></section>
      </div>
      <div className="ws-grid-2" style={{ marginTop: 14 }}>
        <section className="ws-card" id="invoices">
          <h2>Recent invoices</h2>
          {usage.payments.length === 0 ? <p>No invoices yet.</p> : (
            <table className="ws-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {usage.payments.slice(0, 8).map((payment) => (
                  <tr key={payment.id}>
                    <td>{invoiceNumber(payment.id)}</td>
                    <td>{chicagoDate(payment.paid_at || payment.created_at)}</td>
                    <td>{money(payment.amount_cents / 100)}</td>
                    <td><span className="ws-pill live">Paid</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="ws-card" id="payment">
          <h2>Payment method</h2>
          <p>{lastPaid?.public_label ? `Last payment used ${lastPaid.public_label}. A card is not stored on this account.` : "No saved payment method"}</p>
          <p>Add a payment method when you choose or change a plan.</p>
          <p><Link className="ws-btn ghost" href="/account/billing/plan">Add payment method</Link></p>
        </section>
      </div>
    </div>
  );
}
