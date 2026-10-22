import { saveConnection, testConnection } from "../actions";
import { getConnection } from "@/lib/carriers";

function VoipForm() {
  const connection = getConnection("voipms");
  const config = connection.public;
  return (
    <form className="contact-form" action={saveConnection}>
      <h3>VoIP.ms</h3>
      <input type="hidden" name="provider" value="voipms" />
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /> Enabled</label>
      <label>API username <input name="api_username" defaultValue={config.api_username || ""} placeholder="you@company.com" /></label>
      <label>API password <input name="secret" type="password" placeholder={connection.hasSecret ? "Saved. Leave blank to keep it." : "API password"} autoComplete="new-password" /></label>
      <label>API address <input name="endpoint" defaultValue={config.endpoint || "https://voip.ms/api/v1/rest.php"} /></label>
      <div className="form-grid">
        <label>Order routing <input name="routing" defaultValue={config.routing || ""} placeholder="account:100001" /></label>
        <label>POP <input name="pop" defaultValue={config.pop || ""} /></label>
      </div>
      <div className="form-grid">
        <label>Dial time <input name="dialtime" defaultValue={config.dialtime || "60"} /></label>
        <label>Billing type
          <select name="billing_type" defaultValue={config.billing_type || "1"}><option value="1">Per minute</option><option value="2">Flat</option></select>
        </label>
      </div>
      <label className="check-option"><input type="checkbox" name="cnam" defaultChecked={config.cnam === "1"} /> Caller ID name</label>
      <p>{connection.checked_at ? `${connection.last_ok ? "Last test succeeded" : "Last test failed"}: ${connection.last_message}` : "Not tested yet."}</p>
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
      <input type="hidden" name="provider" value="3cx" />
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /> Enabled</label>
      <label>PBX address <input name="base_url" defaultValue={config.base_url || ""} placeholder="https://pbx.example.com" /></label>
      <label>Client ID <input name="client_id" defaultValue={config.client_id || ""} /></label>
      <label>Client secret <input name="secret" type="password" placeholder={connection.hasSecret ? "Saved. Leave blank to keep it." : "API key"} autoComplete="new-password" /></label>
      <p>{connection.checked_at ? `${connection.last_ok ? "Last test succeeded" : "Last test failed"}: ${connection.last_message}` : "Not tested yet."}</p>
      <button className="btn btn-primary" type="submit">Save 3CX</button>
    </form>
  );
}

export default function ConnectionsPage() {
  return (
    <>
      <span className="eyebrow">CONNECTIONS</span>
      <h2>VoIP.ms and 3CX</h2>
      <p>Credentials stay on the server. Live number search, ordering, and transfer submission each have their own switch under Feature switches. Ordering spends VoIP.ms balance, so leave that switch off until a test order is intended.</p>
      <div className="features-grid">
        <div>
          <VoipForm />
          <form action={testConnection} style={{ marginTop: 12 }}><input type="hidden" name="provider" value="voipms" /><button className="btn btn-secondary" type="submit">Test VoIP.ms</button></form>
        </div>
        <div>
          <PbxForm />
          <form action={testConnection} style={{ marginTop: 12 }}><input type="hidden" name="provider" value="3cx" /><button className="btn btn-secondary" type="submit">Test 3CX</button></form>
        </div>
      </div>
    </>
  );
}
