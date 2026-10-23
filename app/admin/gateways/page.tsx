import { GatewayForm } from "@/components/admin/Editors";
import { setGatewayEnabled, testGateway } from "../actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";
import { readGatewaySecret } from "@/lib/payment-keys";
import { publicGatewayConfig } from "@/lib/payments";

const COMPANY: Record<string, string> = { stripe: "Stripe", paypal: "PayPal", square: "Square" };

export default async function GatewaysPage() {
  await requirePermission("settings.payments");
  const gateways = getDb().prepare("SELECT id, name, provider_key, public_label, enabled, priority, mode, currencies, config_json, secret, last_ok, last_message, checked_at FROM gateways ORDER BY priority, id").all() as {
    id: number;
    name: string;
    provider_key: string;
    public_label: string;
    enabled: number;
    priority: number;
    mode: string;
    currencies: string;
    config_json: string;
    secret: string;
    last_ok: number;
    last_message: string;
    checked_at: string;
  }[];
  return (
    <>
      <span className="eyebrow">Integrations</span>
      <h2>Ways to pay</h2>
      <p>Paste the API key and secret from Stripe, PayPal, or Square. Practice only uses that company’s test account. Real payments charges the customer. The secret stays on this server and is never shown again.</p>
      <div className="faq-list">
        {gateways.map((gateway) => {
          const secret = readGatewaySecret(gateway.secret);
          return (
            <article key={gateway.id} className="feature-card" style={{ marginBottom: 16 }}>
              <h3>{gateway.public_label}</h3>
              <p>{COMPANY[gateway.provider_key] || gateway.provider_key} · {gateway.mode === "live" ? "Real payments" : "Practice only"} · {gateway.currencies} · {gateway.enabled ? "On" : "Off"} · {secret.key ? "Secret saved" : "Secret missing"}</p>
              <p>{gateway.checked_at ? `${gateway.last_ok ? "Last check worked" : "Last check failed"}: ${gateway.last_message}` : "Not checked yet."}</p>
              <form action={setGatewayEnabled}>
                <input type="hidden" name="id" value={gateway.id} />
                <input type="hidden" name="enabled" value={gateway.enabled ? 0 : 1} />
                <button className="btn btn-secondary" type="submit">{gateway.enabled ? "Turn off" : "Turn on"}</button>
              </form>
              <form action={testGateway}>
                <input type="hidden" name="id" value={gateway.id} />
                <button className="btn btn-secondary" type="submit">Check saved keys</button>
              </form>
              <GatewayForm gateway={{ id: gateway.id, name: gateway.name, provider_key: gateway.provider_key, public_label: gateway.public_label, enabled: gateway.enabled, priority: gateway.priority, mode: gateway.mode, currencies: gateway.currencies, config: publicGatewayConfig(gateway.config_json), hasSecret: Boolean(secret.key), hasWebhook: Boolean(secret.webhook) }} />
            </article>
          );
        })}
      </div>
      <h3>Add a way to pay</h3>
      <GatewayForm />
    </>
  );
}
