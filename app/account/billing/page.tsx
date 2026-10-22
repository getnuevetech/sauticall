import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { AuthForm } from "@/components/account/AuthForm";
import { startCheckout } from "../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { loadSite } from "@/lib/site";
import { readGatewaySecret } from "@/lib/payment-keys";
import type { Plan } from "@/lib/types";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("billing.checkout");
  const gateways = getDb().prepare("SELECT id, public_label, secret FROM gateways WHERE enabled = 1 ORDER BY priority").all() as { id: number; public_label: string; secret: string }[];
  const ready = gateways.filter((gateway) => readGatewaySecret(gateway.secret).key).map(({ id, public_label }) => ({ id, public_label }));
  const plans = readDoc<Plan[]>("plans").filter((plan) => !plan.custom && plan.price > 0);
  return (
    <Frame pathname="/account/billing">
      <main>
        <AccountHero eyebrow="BILLING" title={text("billingTitle")} body={text("billingBody")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/billing" />
            {params.error ? <p className="form-feedback">{params.error}</p> : null}
            {!open ? <div className="contact-form"><p>{text("billingClosed")}</p></div> : null}
            {open && ready.length === 0 ? <div className="contact-form"><p>{gateways.length ? "A way to pay is turned on, but its API secret is not saved yet." : text("billingEmpty")}</p></div> : null}
            {open && ready.length > 0 ? (
              <div className="faq-list">
                {plans.map((plan) => (
                  <article key={plan.name} className="feature-card" style={{ marginBottom: 16 }}>
                    <h3>{plan.name}</h3>
                    <p>${plan.price} per month · {plan.units}</p>
                    {ready.map((gateway) => (
                      <AuthForm
                        key={gateway.id}
                        action={startCheckout}
                        submit={`Pay with ${gateway.public_label}`}
                        fields={[]}
                        extra={<><input type="hidden" name="plan" value={plan.name} /><input type="hidden" name="gatewayId" value={gateway.id} /></>}
                      />
                    ))}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </Frame>
  );
}
