import { saveConnection, testConnection } from "../actions";
import { requirePermission } from "@/lib/access";
import { getConnection } from "@/lib/carriers";
import { dialTimeChoices, withCurrent } from "@/lib/admin-choices";

function VoipForm() {
  const connection = getConnection("voipms");
  const config = connection.public;
  return (
    <form className="contact-form" action={saveConnection}>
      <h3>VoIP.ms</h3>
      <p>API username and API password from the VoIP.ms customer portal. The check calls getBalance. Ordering a number also needs the routing and POP from that account.</p>
      <input type="hidden" name="provider" value="voipms" />
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /> Use this connection</label>
      <label>API username <input name="api_username" defaultValue={config.api_username || ""} placeholder="you@company.com" autoComplete="off" /></label>
      <label>API password <input name="secret" type="password" placeholder={connection.hasSecret ? "Saved. Leave blank to keep it." : "API password"} autoComplete="new-password" /></label>
      <label>API address <input name="endpoint" defaultValue={config.endpoint || "https://voip.ms/api/v1/rest.php"} /></label>
      <label>Routing <input name="routing" defaultValue={config.routing || ""} placeholder="account:100001" /></label>
      <label>POP <input name="pop" defaultValue={config.pop || ""} placeholder="Point of presence" /></label>
      <details className="admin-more">
        <summary>More settings</summary>
        <div className="admin-more-body">
          <label>How long the phone rings
            <select name="dialtime" defaultValue={config.dialtime || "60"}>
              {withCurrent(dialTimeChoices, config.dialtime || "60").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>How the number is billed
            <select name="billing_type" defaultValue={config.billing_type || "1"}><option value="1">Per minute</option><option value="2">One monthly price</option></select>
          </label>
          <label className="check-option"><input type="checkbox" name="cnam" defaultChecked={config.cnam === "1"} /> Show the caller’s name</label>
          <label>Line account phone type code <input name="device_type" defaultValue={config.device_type || "1"} /></label>
          <label>International route
            <select name="international_route" defaultValue={config.international_route || "1"}><option value="1">Value</option><option value="2">Premium</option></select>
          </label>
          <label className="check-option"><input type="checkbox" name="lock_international" defaultChecked={config.lock_international === "1"} /> Block international calls on new line accounts</label>
          <label>Hold music <input name="music_on_hold" defaultValue={config.music_on_hold || "default"} /></label>
          <label>Codecs <input name="allowed_codecs" defaultValue={config.allowed_codecs || "ulaw;alaw;g729"} /></label>
          <label>DTMF <input name="dtmf_mode" defaultValue={config.dtmf_mode || "auto"} /></label>
          <label>NAT <input name="nat" defaultValue={config.nat || "yes"} /></label>
        </div>
      </details>
      <p>{connection.checked_at ? `${connection.last_ok ? "Last check worked" : "Last check failed"}: ${connection.last_message}` : "Not checked yet."}</p>
      <button className="btn btn-primary" type="submit">Save VoIP.ms</button>
    </form>
  );
}

function PbxForm() {
  const connection = getConnection("3cx");
  const config = connection.public;
  return (
    <form className="contact-form" action={saveConnection}>
      <h3>3CX</h3>
      <p>The check asks 3CX for an access token at /connect/token, then reads the system version. Use the client ID and client secret from the 3CX API integration.</p>
      <input type="hidden" name="provider" value="3cx" />
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /> Use this connection</label>
      <label>API base URL <input name="base_url" defaultValue={config.base_url || ""} placeholder="https://pbx.example.com" autoComplete="off" /></label>
      <label>API client ID <input name="client_id" defaultValue={config.client_id || ""} autoComplete="off" /></label>
      <label>API client secret <input name="secret" type="password" placeholder={connection.hasSecret ? "Saved. Leave blank to keep it." : "Client secret"} autoComplete="new-password" /></label>
      <label>Trunk template <input name="trunk_template" defaultValue={config.trunk_template || "GenericSIPTrunk.pv.xml"} /></label>
      <p>{connection.checked_at ? `${connection.last_ok ? "Last check worked" : "Last check failed"}: ${connection.last_message}` : "Not checked yet."}</p>
      <button className="btn btn-primary" type="submit">Save 3CX</button>
    </form>
  );
}

export default async function ConnectionsPage() {
  await requirePermission("settings.connections");
  return (
    <>
      <span className="eyebrow">Settings</span>
      <h2>Phone connections</h2>
      <p>Enter the VoIP.ms and 3CX API credentials. They stay on this server and are not shown again after you save. Searching, buying, sending transfers, reading call minutes, and adding trunks are separate switches under What customers can do. Buying a number spends money, so leave that switch off until you mean to.</p>
      <div className="features-grid">
        <div>
          <VoipForm />
          <form action={testConnection} style={{ marginTop: 12 }}><input type="hidden" name="provider" value="voipms" /><button className="btn btn-secondary" type="submit">Check VoIP.ms</button></form>
        </div>
        <div>
          <PbxForm />
          <form action={testConnection} style={{ marginTop: 12 }}><input type="hidden" name="provider" value="3cx" /><button className="btn btn-secondary" type="submit">Check 3CX</button></form>
        </div>
      </div>
    </>
  );
}
