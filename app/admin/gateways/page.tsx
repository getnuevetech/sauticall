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
      <span className="eyebrow">PAYMENTS</span>
      <h2>Payment gateways</h2>
      <p>Add a gateway, or enable and disable the ones already here. Checkout only offers gateways that are enabled, in priority order.</p>
      <div className="faq-list">
        {gateways.map((gateway) => (
          <article key={gateway.id} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{gateway.public_label}</h3>
            <p>{gateway.provider_key} · {gateway.mode} · {gateway.currencies} · {gateway.enabled ? "enabled" : "disabled"}</p>
            <form action={setGatewayEnabled}>
              <input type="hidden" name="id" value={gateway.id} />
              <input type="hidden" name="enabled" value={gateway.enabled ? 0 : 1} />
              <button className="btn btn-secondary" type="submit">{gateway.enabled ? "Disable" : "Enable"}</button>
            </form>
            <GatewayForm gateway={gateway} />
          </article>
        ))}
      </div>
      <h3>Add a gateway</h3>
      <GatewayForm />
    </>
  );
}
