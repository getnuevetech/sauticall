import { saveConnection, testConnection } from "../actions";
import { getConnection } from "@/lib/carriers";
import { dialTimeChoices, withCurrent } from "@/lib/admin-choices";

function VoipForm() {
  const connection = getConnection("voipms");
  const config = connection.public;
  return (
    <form className="contact-form" action={saveConnection}>
      <h3>Phone numbers</h3>
      <p>This is the company that sells and transfers numbers.</p>
      <input type="hidden" name="provider" value="voipms" />
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /> Use this connection</label>
      <label>Sign-in email <input name="api_username" defaultValue={config.api_username || ""} placeholder="you@company.com" /></label>
      <label>Password <input name="secret" type="password" placeholder={connection.hasSecret ? "Saved. Leave blank to keep it." : "Password from the phone company"} autoComplete="new-password" /></label>
      <details className="admin-more">
        <summary>More settings</summary>
        <div className="admin-more-body">
          <label>Web address <input name="endpoint" defaultValue={config.endpoint || "https://voip.ms/api/v1/rest.php"} /></label>
          <label>Where a new number should ring <input name="routing" defaultValue={config.routing || ""} placeholder="account:100001" /></label>
          <label>Server location <input name="pop" defaultValue={config.pop || ""} /></label>
          <label>How long the phone rings
            <select name="dialtime" defaultValue={config.dialtime || "60"}>
              {withCurrent(dialTimeChoices, config.dialtime || "60").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>How the number is billed
            <select name="billing_type" defaultValue={config.billing_type || "1"}><option value="1">Per minute</option><option value="2">One monthly price</option></select>
          </label>
          <label className="check-option"><input type="checkbox" name="cnam" defaultChecked={config.cnam === "1"} /> Show the caller’s name</label>
        </div>
      </details>
      <p>{connection.checked_at ? `${connection.last_ok ? "Last check worked" : "Last check failed"}: ${connection.last_message}` : "Not checked yet."}</p>
      <button className="btn btn-primary" type="submit">Save phone numbers</button>
    </form>
  );
}

function PbxForm() {
  const connection = getConnection("3cx");
  const config = connection.public;
  return (
    <form className="contact-form" action={saveConnection}>
      <h3>Phone system</h3>
      <p>This is the system that rings your team.</p>
      <input type="hidden" name="provider" value="3cx" />
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={connection.enabled === 1} /> Use this connection</label>
      <label>Phone system web address <input name="base_url" defaultValue={config.base_url || ""} placeholder="https://pbx.example.com" /></label>
      <label>Login ID <input name="client_id" defaultValue={config.client_id || ""} /></label>
      <label>Secret key <input name="secret" type="password" placeholder={connection.hasSecret ? "Saved. Leave blank to keep it." : "Secret key from the phone system"} autoComplete="new-password" /></label>
      <p>{connection.checked_at ? `${connection.last_ok ? "Last check worked" : "Last check failed"}: ${connection.last_message}` : "Not checked yet."}</p>
      <button className="btn btn-primary" type="submit">Save phone system</button>
    </form>
  );
}

export default function ConnectionsPage() {
  return (
    <>
      <span className="eyebrow">Settings</span>
      <h2>Phone connections</h2>
      <p>Connect the company that provides numbers, and the phone system that rings your team. Passwords stay on this server. Searching, buying, and sending transfers are separate switches under What customers can do. Buying a number spends money, so leave that switch off until you mean to.</p>
      <div className="features-grid">
        <div>
          <VoipForm />
          <form action={testConnection} style={{ marginTop: 12 }}><input type="hidden" name="provider" value="voipms" /><button className="btn btn-secondary" type="submit">Check phone numbers</button></form>
        </div>
        <div>
          <PbxForm />
          <form action={testConnection} style={{ marginTop: 12 }}><input type="hidden" name="provider" value="3cx" /><button className="btn btn-secondary" type="submit">Check phone system</button></form>
        </div>
      </div>
    </>
  );
}
