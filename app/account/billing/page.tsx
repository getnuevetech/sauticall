import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { AuthForm } from "@/components/account/AuthForm";
import { startCheckout } from "../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { loadSite } from "@/lib/site";

export default async function BillingPage() {
  await guardAccount();
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("billing.checkout");
  const gateways = getDb().prepare("SELECT id, public_label, provider_key, mode FROM gateways WHERE enabled = 1 ORDER BY priority").all() as { id: number; public_label: string; provider_key: string; mode: string }[];
  return (
    <Frame pathname="/account/billing">
      <main>
        <AccountHero eyebrow="BILLING" title={text("billingTitle")} body={text("billingBody")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/billing" />
            {!open ? <div className="contact-form"><p>{text("billingClosed")}</p></div> : null}
            {open && gateways.length === 0 ? <div className="contact-form"><p>{text("billingEmpty")}</p></div> : null}
            {open && gateways.length > 0 ? (
              <div className="price-grid">
                {gateways.map((gateway) => (
                  <article key={gateway.id} className="price-card">
                    <div className="plan-name">{gateway.public_label}</div>
                    <p>{gateway.provider_key} · {gateway.mode}</p>
                    <AuthForm action={startCheckout} submit={`Continue with ${gateway.public_label}`} fields={[]} extra={<input type="hidden" name="gatewayId" value={gateway.id} />} />
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
