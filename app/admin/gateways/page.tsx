import Link from "next/link";
import { GatewayForm } from "@/components/admin/Editors";
import { testGateway } from "../actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";
import { readGatewaySecret } from "@/lib/payment-keys";
import { publicGatewayConfig } from "@/lib/payments";

const COMPANY: Record<string, string> = { stripe: "Stripe", paypal: "PayPal", square: "Square" };

function whenChecked(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const zone = "America/Chicago";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }).format(date);
  const today = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }).format(new Date());
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(date);
  return `${day === today ? "Today" : day}, ${time}`;
}

function configured(provider: string, config: ReturnType<typeof publicGatewayConfig>, hasSecret: boolean) {
  if (provider === "stripe") return Boolean(config.publishable_key && hasSecret);
  if (provider === "paypal") return Boolean(config.client_id && hasSecret);
  if (provider === "square") return Boolean(config.application_id && config.location_id && hasSecret);
  return hasSecret;
}

export default async function GatewaysPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string; saved?: string }> }) {
  await requirePermission("settings.payments");
  const query = await searchParams;
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
  const creating = query.new === "1";
  const selected = creating ? undefined : gateways.find((item) => item.id === Number(query.id)) || gateways[0];
  const secret = selected ? readGatewaySecret(selected.secret) : { key: "", webhook: "" };
  const config = selected ? publicGatewayConfig(selected.config_json) : publicGatewayConfig("");
  return (
    <div className="ops">
      <div>
        <p className="ops-kicker">Integrations / Payments</p>
        <h1>Payment integrations</h1>
        <p>Manage gateway configuration and connection checks.</p>
        {query.saved ? <p className="form-feedback">Configuration saved. No customer was charged.</p> : null}
        <div className="ops-pick">
          {gateways.map((gateway) => {
            const stored = readGatewaySecret(gateway.secret);
            const ready = configured(gateway.provider_key, publicGatewayConfig(gateway.config_json), Boolean(stored.key));
            const current = !creating && selected?.id === gateway.id;
            return (
              <Link key={gateway.id} className="ops-card ops-provider" href={`/admin/gateways?id=${gateway.id}`} data-current={current ? "true" : undefined}>
                <span className="ops-mark-sm">{(COMPANY[gateway.provider_key] || gateway.provider_key).slice(0, 1)}</span>
                <span>
                  <strong>{COMPANY[gateway.provider_key] || gateway.public_label}</strong>
                  <small>{gateway.public_label}</small>
                </span>
                <span className={`ops-badge ${ready ? "ok" : "muted"}`}>{ready ? "Configuration saved" : "Not configured"}</span>
                <span className="ops-check">
                  <span className={`ops-badge ${gateway.checked_at ? (gateway.last_ok ? "ok" : "warn") : "muted"}`}>{gateway.checked_at ? (gateway.last_ok ? "Passed" : "Failed") : "Not checked"}</span>
                  {whenChecked(gateway.checked_at) ? <small>{whenChecked(gateway.checked_at)}</small> : null}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="ops-muted"><Link href="/admin/gateways?new=1">Add a gateway</Link></p>
      </div>
      <aside className="ops-drawer">
        {creating || !selected ? (
          <>
            <div className="ops-drawer-head"><h2>Add a gateway</h2></div>
            <GatewayForm />
          </>
        ) : (
          <>
            <div className="ops-drawer-head">
              <div>
                <h2>Configure {COMPANY[selected.provider_key] || selected.public_label}</h2>
                <p className="ops-kicker">{selected.mode === "live" ? "Real payments" : "Practice only"} · {selected.currencies}</p>
              </div>
            </div>
            <dl className="ops-facts">
              <div><dt>Last check</dt><dd>{selected.checked_at ? (selected.last_ok ? "Passed" : "Failed") : "Not run"}<small>{whenChecked(selected.checked_at) || "Run a connection check to verify the saved configuration."}</small></dd></div>
            </dl>
            {selected.checked_at && !selected.last_ok ? <p className="ops-alert">{selected.last_message || "The last connection check failed."}</p> : null}
            <GatewayForm gateway={{ id: selected.id, name: selected.name, provider_key: selected.provider_key, public_label: selected.public_label, enabled: selected.enabled, priority: selected.priority, mode: selected.mode, currencies: selected.currencies, config, hasSecret: Boolean(secret.key), hasWebhook: Boolean(secret.webhook) }} />
            <form action={testGateway} className="ops-actions">
              <input type="hidden" name="id" value={selected.id} />
              <button className="btn btn-secondary" type="submit">Check saved configuration</button>
            </form>
            <p className="ops-muted">A connection check does not charge a customer.</p>
            <p className="ops-muted"><Link href="/admin/flags">Manage payment permissions</Link>. Payment integrations use the existing platform permissions.</p>
          </>
        )}
      </aside>
    </div>
  );
}
