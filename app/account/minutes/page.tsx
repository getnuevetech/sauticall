import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { refreshMinutes, startBundleCheckout } from "../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { minuteBalance } from "@/lib/minutes";
import { customerMessage } from "@/lib/customer-message";
import { loadSite } from "@/lib/site";
import { readGatewaySecret } from "@/lib/payment-keys";

export default async function MinutesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const balance = minuteBalance(user.id);
  const open = flagOn("billing.checkout");
  const bundles = readDoc<{ name: string; minutes: number; price: number; enabled?: boolean }[]>("minute_bundles").filter((bundle) => bundle.enabled !== false && Number(bundle.minutes) > 0 && Number(bundle.price) > 0);
  const gateways = getDb().prepare("SELECT id, public_label, secret FROM gateways WHERE enabled = 1 ORDER BY priority").all() as { id: number; public_label: string; secret: string }[];
  const ready = gateways.filter((gateway) => readGatewaySecret(gateway.secret).key);
  return (
    <Frame pathname="/account/minutes">
      <main>
        <AccountHero eyebrow="CALL MINUTES" title={text("minutesTitle")} body={text("minutesBody")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/minutes" />
            {params.error ? <p className="form-feedback">{customerMessage(params.error, "Call minutes could not be updated. Please try again, or contact support.")}</p> : null}
            {params.saved ? <p>Minutes updated from the phone company.</p> : null}
            <div className="features-grid" style={{ marginBottom: 24 }}>
              <article className="feature-card"><h3>{text("minutesPlan")}</h3><p>{balance.planMinutesLeft}</p></article>
              <article className="feature-card"><h3>{text("minutesBundle")}</h3><p>{balance.bundleMinutesLeft}</p></article>
              <article className="feature-card"><h3>{text("minutesUsed")}</h3><p>{balance.usedMinutes}</p></article>
            </div>
            <form action={refreshMinutes}><button className="btn btn-secondary" type="submit">Update minutes from the phone company</button></form>
            <h2 style={{ marginTop: 28 }}>{text("minutesBuy")}</h2>
            {!open ? <p>{text("minutesClosed")}</p> : null}
            {open && bundles.length === 0 ? <p>{text("minutesEmpty")}</p> : null}
            {open && ready.length === 0 && bundles.length > 0 ? <p>A way to pay is not ready yet.</p> : null}
            {open ? bundles.map((bundle) => (
              <article key={bundle.name} className="feature-card" style={{ marginTop: 16 }}>
                <h3>{bundle.name}</h3>
                <p>{bundle.minutes} outbound minutes · ${bundle.price}</p>
                {ready.map((gateway) => (
                  <form key={gateway.id} action={startBundleCheckout}>
                    <input type="hidden" name="bundle" value={bundle.name} />
                    <input type="hidden" name="gatewayId" value={gateway.id} />
                    <button className="btn btn-primary" type="submit">Pay with {gateway.public_label}</button>
                  </form>
                ))}
              </article>
            )) : null}
          </div>
        </section>
      </main>
    </Frame>
  );
}
