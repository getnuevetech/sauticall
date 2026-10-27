import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { saveOwnLineVariables } from "../actions";
import { guardAccount } from "@/lib/guard";
import { accountUsage } from "@/lib/account-usage";
import { chicagoDate, chicagoDay, invoiceNumber, money, usagePercent, wholeMoney } from "@/lib/account-display";
import { customerMessage } from "@/lib/customer-message";
import { customerValues, listLineVariables, planPaidAt } from "@/lib/line-variable-store";
import { calendarLabel, customerCanEdit, nextBillingDate, resolveVariable } from "@/lib/line-variables";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string; saved?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  if (params.plan) redirect(`/account/billing/plan?review=${encodeURIComponent(params.plan)}`);
  const usage = accountUsage(user.id);
  const plan = usage.plan;
  const percent = usagePercent(usage.usedMinutes, usage.included);
  const lastPaid = usage.planPayment;
  const variables = listLineVariables();
  const mine = customerValues(user.id);
  const billing = variables.find((item) => item.key === "billing_days");
  const billingDays = billing ? resolveVariable(billing, mine.get(billing.key) || "") || "30" : "30";
  const paidAt = planPaidAt(user.id);
  const billDate = calendarLabel(nextBillingDate(paidAt, billingDays));
  const editable = variables.filter((item) => customerCanEdit(item));
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
      {params.error ? <p className="form-feedback">{customerMessage(params.error, "That billing step could not be completed. Please try again, or contact support.")}</p> : null}
      {params.saved === "variables" ? <p className="form-feedback">Your billing choices were saved.</p> : null}
      <section className="ws-card" style={{ marginBottom: 14 }}>
        <h2>Next phone bill</h2>
        <p>{billDate}. {paidAt ? "It starts on the day you paid." : "There is no plan payment yet, so it starts today."} The number of days set for this account is added until the date is after today.</p>
        {editable.length ? (
          <form className="pub-form" action={saveOwnLineVariables}>
            {editable.map((item) => (
              <label key={item.key}>
                {item.label}
                <input name={`value_${item.key}`} type={item.kind === "days" ? "number" : "text"} min={item.kind === "days" ? 1 : undefined} max={item.kind === "days" ? 365 : undefined} defaultValue={mine.get(item.key) || item.adminValue} required={item.kind === "days"} />
              </label>
            ))}
            <button className="ws-btn primary" type="submit">Save</button>
          </form>
        ) : <p>The number of days is set by the team.</p>}
      </section>
      <div className="ws-grid-2 bill-top">
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
          <div className="bill-usage">
            <p className="price">{usage.usedMinutes.toLocaleString("en-US")} / {usage.included.toLocaleString("en-US")} <small>min used</small></p>
            <strong>{percent}%</strong>
          </div>
          <div className="ws-meter"><span style={{ width: `${percent}%` }} /></div>
          <div className="ws-split">
            <span>{usage.remaining.toLocaleString("en-US")} minutes remaining</span>
            <span>{usage.periodEnd ? `Resets ${chicagoDate(usage.periodEnd)}` : "Minutes appear after a plan payment"}</span>
          </div>
          <div className="ws-actions">
            <Link className="ws-btn ghost" href="/account/minutes">View usage</Link>
            <Link className="ws-btn ghost" href="/account/minutes">Buy extra minutes</Link>
          </div>
        </section>
      </div>
      <div className="ws-grid-3 bill-figures">
        <section className="ws-card"><span>Subscription</span><b>{plan ? money(plan.price) : money(0)}</b></section>
        <section className="ws-card"><span>Additional charges</span><b>{money(usage.extraCents / 100)}</b></section>
        <section className="ws-card">
          <span className="bill-note">Estimated next bill <Icon name="info" size={14} /></span>
          <b>{money(usage.renewalAmount)}</b>
          <span>Taxes and any additional charges shown at checkout.</span>
        </section>
      </div>
      <div className="ws-grid-2 bill-top" style={{ marginTop: 14 }}>
        <section className="ws-card" id="invoices">
          <h2>Recent invoices</h2>
          {usage.payments.length === 0 ? <p>No invoices yet.</p> : (
            <table className="ws-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th><th>Download</th></tr></thead>
              <tbody>
                {usage.payments.slice(0, 8).map((payment) => (
                  <tr key={payment.id}>
                    <td>{invoiceNumber(payment.id)}</td>
                    <td>{chicagoDate(payment.paid_at || payment.created_at)}</td>
                    <td>{money(payment.amount_cents / 100)}</td>
                    <td><span className="ws-pill live">Paid</span></td>
                    <td><a className="bill-dl" href={`/account/billing/invoice/${payment.id}`} aria-label={`Download ${invoiceNumber(payment.id)}`}><Icon name="download" size={16} /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="ws-card" id="payment">
          <h2>Payment method</h2>
          <div className="bill-pay">
            <span className="ws-ico"><Icon name="card" size={18} /></span>
            <div>
              <strong>{lastPaid?.public_label ? `Last payment used ${lastPaid.public_label}` : "No saved payment method"}</strong>
              <p>{lastPaid?.public_label ? "A card is not stored on this account." : "Add a payment method to keep your service active."}</p>
            </div>
          </div>
          <p><Link className="ws-btn ghost" href="/account/billing/plan">Add payment method</Link></p>
        </section>
      </div>
    </div>
  );
}
