import Link from "next/link";
import { saveConnection, savePlacesKey, testConnection } from "../actions";
import { PlaceSelects } from "@/components/account/PlaceSelects";
import { SecretField } from "@/components/admin/SecretField";
import { requirePermission } from "@/lib/access";
import { dialTimeChoices, withCurrent } from "@/lib/admin-choices";
import { getConnection } from "@/lib/carriers";
import { lineCodecs } from "@/lib/line-codecs";

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

function ProviderCard({ id, name, detail, current }: { id: string; name: string; detail: string; current: boolean }) {
  const connection = getConnection(id);
  return (
    <Link className="ops-card ops-provider" href={`/admin/connections?provider=${id}`} data-current={current ? "true" : undefined}>
      <span className="ops-mark-sm">{name.slice(0, 1)}</span>
      <span>
        <strong>{name}</strong>
        <small>{detail}</small>
      </span>
      <span className={`ops-badge ${connection.enabled ? "ok" : "muted"}`}>{connection.enabled ? "Enabled" : "Disabled"}</span>
      <span className="ops-check">
        <span className={`ops-badge ${connection.checked_at ? (connection.last_ok ? "ok" : "warn") : "muted"}`}>{connection.checked_at ? (connection.last_ok ? "Passed" : "Failed") : "Not checked"}</span>
        {whenChecked(connection.checked_at) ? <small>{whenChecked(connection.checked_at)}</small> : null}
      </span>
    </Link>
  );
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ provider?: string; saved?: string }> }) {
  await requirePermission("settings.connections");
  const query = await searchParams;
  const provider = query.provider === "3cx" ? "3cx" : "voipms";
  const connection = getConnection(provider);
  const config = connection.public;
  return (
    <div className="ops">
      <div>
        <p className="ops-kicker">Integrations / System connections</p>
        <h1>System connections</h1>
        <p>Configure provider access and inspect connection checks.</p>
        {query.saved ? <p className="form-feedback">{query.saved === "places" ? "Google address lookup saved. No address was sent." : "Connection saved. No number was bought and no trunk was added."}</p> : null}
        <div className="ops-pick">
          <ProviderCard id="voipms" name="VoIP.ms" detail="SIP trunking, DIDs and SMS" current={provider === "voipms"} />
          <ProviderCard id="3cx" name="3CX" detail="PBX and trunk management" current={provider === "3cx"} />
        </div>
        <p className="ops-muted"><Link href="/admin/flags">Operational permissions are in Platform controls.</Link> Searching, buying, porting, funding, and the VoIP.ms backup stay on those switches. The backup is off until an administrator turns it on.</p>
        <form action={savePlacesKey} className="ops-card">
          <h2>Google addresses</h2>
          <p>Customers confirm a complete address from Google. The key stays on this server. Leave the key blank to keep the one already saved.</p>
          <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={getConnection("google").enabled === 1} /> Use Google address lookup</label>
          <SecretField name="secret" label="Google Places key" stored={getConnection("google").hasSecret} />
          <button className="btn btn-secondary" type="submit">Save Google address lookup</button>
        </form>
      </div>
      <aside className="ops-drawer">
        <div className="ops-drawer-head">
          <div>
            <h2>{provider === "3cx" ? "3CX" : "VoIP.ms"}</h2>
            <p className="ops-kicker">{provider === "3cx" ? "PBX and trunk management" : "SIP trunking, DIDs and SMS"}</p>
          </div>
        </div>
        {connection.checked_at && !connection.last_ok ? <p className="ops-alert">The last authorization check failed. Review the saved access and the response below.</p> : null}
        <form action={saveConnection} className="ops-stack">
          <input type="hidden" name="provider" value={provider} />
          <div className="ops-feature">
            <div><strong>Enabled</strong><p>Saving this switch does not run a connection check.</p></div>
            <label className="ops-toggle-row"><span>{connection.enabled ? "On" : "Off"}</span><span className="ops-toggle"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /><span /></span></label>
          </div>
          <dl className="ops-facts">
            <div><dt>Last saved check</dt><dd>{connection.checked_at ? (connection.last_ok ? "Passed" : "Failed") : "Not checked"}{whenChecked(connection.checked_at) ? <small>{whenChecked(connection.checked_at)}</small> : null}</dd></div>
          </dl>
          {provider === "voipms" ? (
            <>
              <label>API username <input name="api_username" defaultValue={config.api_username || ""} autoComplete="off" /></label>
              <SecretField name="secret" label="API password" stored={connection.hasSecret} />
              <label>API address <input name="endpoint" defaultValue={config.endpoint || "https://voip.ms/api/v1/rest.php"} /></label>
              <label>Routing <input name="routing" defaultValue={config.routing || ""} placeholder="account:100001" /></label>
              <label>POP <input name="pop" defaultValue={config.pop || ""} /></label>
              <label>Text message number <input name="sms_did" defaultValue={config.sms_did || ""} inputMode="numeric" autoComplete="off" /></label>
              <details className="ops-details">
                <summary>Advanced settings</summary>
                <div className="ops-stack">
                  <label>How long the phone rings
                    <select name="dialtime" defaultValue={config.dialtime || "60"}>
                      {withCurrent(dialTimeChoices, config.dialtime || "60").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>How the number is billed
                    <select name="billing_type" defaultValue={config.billing_type || "1"}><option value="1">Per minute</option><option value="2">One monthly price</option></select>
                  </label>
                  <label className="check-option"><input type="checkbox" name="cnam" defaultChecked={config.cnam === "1"} /> Show the caller’s name</label>
                  <p className="ops-muted">A line account is created as an ATA device, IP Phone or Softphone.</p>
                  <label>International route
                    <select name="international_route" defaultValue={config.international_route || "1"}><option value="1">Value</option><option value="2">Premium</option></select>
                  </label>
                  <label className="check-option"><input type="checkbox" name="lock_international" defaultChecked={config.lock_international === "1"} /> Block international calls on new line accounts</label>
                  <label>Hold music <input name="music_on_hold" defaultValue={config.music_on_hold || "default"} /></label>
                  <label>Codecs <input name="allowed_codecs" defaultValue={lineCodecs(config.allowed_codecs || "")} placeholder="ulaw;g729;gsm" /></label>
                  <p className="ops-muted">VoIP.ms accepts ulaw, g729, gsm, or all. Other names are left out before a line account is created.</p>
                  <label>DTMF <input name="dtmf_mode" defaultValue={config.dtmf_mode || "auto"} /></label>
                  <label>NAT <input name="nat" defaultValue={config.nat || "yes"} /></label>
                  <p className="ops-muted">Each customer gets an ID such as I0000001 or B0000001. VoIP.ms is given that ID at sauticall.com. The customer's own email is not sent.</p>
                  <label>Client phone <input name="client_phone" defaultValue={config.client_phone || ""} autoComplete="off" /></label>
                  <label>Street <input name="client_address" defaultValue={config.client_address || ""} autoComplete="off" /></label>
                  <PlaceSelects countryLabel="Country" regionLabel="State or province" cityLabel="City" countryName="client_country" regionName="client_state" cityName="client_city" countryDefault={config.client_country || "US"} regionDefault={config.client_state || ""} cityDefault={config.client_city || ""} />
                  <label>ZIP or postal code <input name="client_zip" defaultValue={config.client_zip || ""} autoComplete="off" /></label>
                </div>
              </details>
            </>
          ) : (
            <>
              <label>API base URL <input name="base_url" defaultValue={config.base_url || ""} autoComplete="off" /></label>
              <label>Client ID <input name="client_id" defaultValue={config.client_id || ""} autoComplete="off" /></label>
              <SecretField name="secret" label="Client secret" stored={connection.hasSecret} />
              <label>Trunk template <input name="trunk_template" defaultValue={config.trunk_template && config.trunk_template !== "GenericSIPTrunk.pv.xml" ? config.trunk_template : "voipms.pv.xml"} /></label>
            </>
          )}
          <details className="ops-details">
            <summary>Setup guide</summary>
            {provider === "3cx" ? <p>In 3CX, open Integrations, then API. Add a client, turn on 3CX Configuration API Access, choose the DEFAULT department, and set the role to System Owner. Then open Advanced, Console Restrictions, and allow access from everywhere.</p> : <p>This login is the reseller account. Signup creates the client with the customer ID email. The SIP sub-account is created when that customer has a paid plan and buys a number. Ordering also needs the routing and POP saved here. Account confirmation texts use the text message number when that number is already on the account.</p>}
          </details>
          <details className="ops-details">
            <summary>Technical response</summary>
            <p>{connection.last_message || "No check has been saved."}</p>
          </details>
          <button className="btn btn-primary" type="submit">Save connection</button>
        </form>
        <form action={testConnection}>
          <input type="hidden" name="provider" value={provider} />
          <button className="btn btn-secondary" type="submit">Check saved connection</button>
        </form>
        <p className="ops-muted">The check uses the saved credentials. It does not buy a number, add a trunk, or charge a customer.</p>
      </aside>
    </div>
  );
}
