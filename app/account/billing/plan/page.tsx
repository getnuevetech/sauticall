import Link from "next/link";
import { AuthForm } from "@/components/account/AuthForm";
import { Icon } from "@/components/Icon";
import { startCheckout } from "../../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { accountUsage } from "@/lib/account-usage";
import { planHighlights, wholeMoney } from "@/lib/account-display";
import { customerMessage } from "@/lib/customer-message";
import { normalizePlan } from "@/lib/plan-features";
import { readGatewaySecret } from "@/lib/payment-keys";
import type { Plan } from "@/lib/types";

export default async function ManagePlanPage({ searchParams }: { searchParams: Promise<{ error?: string; review?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const usage = accountUsage(user.id);
  const current = usage.plan;
  const plans = readDoc<Plan[]>("plans").filter((plan) => !plan.custom && plan.price > 0).map((plan) => normalizePlan(plan));
  const ordered = [...plans].sort((a, b) => a.price - b.price);
  const review = ordered.find((plan) => plan.name === params.review);
  const open = flagOn("billing.checkout");
  const gateways = getDb().prepare("SELECT id, public_label, secret FROM gateways WHERE enabled = 1 ORDER BY priority").all() as { id: number; public_label: string; secret: string }[];
  const ready = gateways.filter((gateway) => readGatewaySecret(gateway.secret).key);
  return (
    <div className="workspace-page" style={{ maxWidth: 1080 }}>
      <Link className="ws-back" href="/account/billing">← Back to billing</Link>
      <h1>Manage your plan</h1>
      <p>Compare plans and choose what fits your business.</p>
      {params.error ? <p className="form-feedback">{customerMessage(params.error, "Payment could not be started. Please try again, or contact support.")}</p> : null}
      <section className="ws-card bill-now">
        <span>Current plan</span>
        {current ? <p>You&apos;re on {current.name} · {wholeMoney(current.price)}/month · {current.seats || 1} {current.seats === 1 ? "person" : "people"} · {current.includedMinutes.toLocaleString("en-US")} outbound minutes.</p> : <p>You do not have a paid plan yet. Choose one below.</p>}
      </section>
      <div className="ws-plans">
        {ordered.map((plan, index) => {
          const previous = index > 0 ? ordered[index - 1] : null;
          const isCurrent = current?.name === plan.name;
          const lower = current ? plan.price < current.price : false;
          const lines = planHighlights(plan, previous);
          return (
            <article key={plan.name} className={`ws-plan${isCurrent ? " current" : ""}`}>
              <div className="bill-plan-head">
                <div>
                  <h2>{plan.name}</h2>
                  <p className="price">{wholeMoney(plan.price)} <small>/ month</small></p>
                </div>
                {isCurrent ? <span className="badge">Current plan</span> : null}
              </div>
              <ul>
                {lines.map((line, lineIndex) => (
                  <li key={line} className={lineIndex < 2 ? "meta" : undefined}>
                    {lineIndex < 2 ? <Icon name={lineIndex === 0 ? "users" : "phone"} size={16} /> : null}
                    {line}
                  </li>
                ))}
              </ul>
              {isCurrent ? <button className="ws-btn" type="button" disabled>Current plan</button> : (
                <Link className={`ws-btn ${lower || !current ? "ghost" : "primary"}`} href={`/account/billing/plan?review=${encodeURIComponent(plan.name)}`}>{current ? (lower ? "Review downgrade" : "Review upgrade") : "Choose plan"}</Link>
              )}
            </article>
          );
        })}
      </div>
      <section className="ws-banner">
        <div>
          <strong><Icon name="info" size={16} /> Review before you confirm</strong>
          <p>{review ? `${review.name} is ${wholeMoney(review.price)} per month. That amount is due when you confirm. The plan starts when the payment is confirmed.` : "See your charge today, new recurring price, and effective date before changing plans."}</p>
          {review && open && ready.length > 0 ? ready.map((gateway) => (
            <AuthForm
              key={gateway.id}
              action={startCheckout}
              className="ws-pay"
              submitClassName="ws-btn primary"
              submit={ready.length === 1 ? `Confirm ${review.name}` : `Pay with ${gateway.public_label}`}
              fields={[]}
              extra={<><input type="hidden" name="plan" value={review.name} /><input type="hidden" name="gatewayId" value={gateway.id} /></>}
            />
          )) : null}
          {review && !open ? <p>Plan changes are turned off by an administrator.</p> : null}
          {review && open && ready.length === 0 ? <p>A way to pay is not ready yet.</p> : null}
        </div>
        <p>Plan changes follow your account&apos;s billing policy.</p>
      </section>
    </div>
  );
}
