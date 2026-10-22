import { GatewayForm } from "@/components/admin/Editors";
import { setGatewayEnabled } from "../actions";
import { getDb } from "@/lib/db";

export default function GatewaysPage() {
  const gateways = getDb().prepare("SELECT * FROM gateways ORDER BY priority, id").all() as {
    id: number;
    name: string;
    provider_key: string;
    public_label: string;
    enabled: number;
    priority: number;
    mode: string;
    currencies: string;
    secret_ref: string;
  }[];
  return (
    <>
      <span className="eyebrow">Payments</span>
      <h2>Ways to pay</h2>
      <p>Add a way to take payment, or turn one on or off. Customers only see the ones that are turned on.</p>
      <div className="faq-list">
        {gateways.map((gateway) => (
          <article key={gateway.id} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{gateway.public_label}</h3>
            <p>{gateway.provider_key === "stripe" ? "Stripe" : gateway.provider_key === "paypal" ? "PayPal" : gateway.provider_key === "square" ? "Square" : gateway.provider_key} · {gateway.mode === "live" ? "Real payments" : "Practice only"} · {gateway.currencies} · {gateway.enabled ? "On" : "Off"}</p>
            <form action={setGatewayEnabled}>
              <input type="hidden" name="id" value={gateway.id} />
              <input type="hidden" name="enabled" value={gateway.enabled ? 0 : 1} />
              <button className="btn btn-secondary" type="submit">{gateway.enabled ? "Turn off" : "Turn on"}</button>
            </form>
            <GatewayForm gateway={gateway} />
          </article>
        ))}
      </div>
      <h3>Add a way to pay</h3>
      <GatewayForm />
    </>
  );
}
