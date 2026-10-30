import { SecretField } from "@/components/admin/SecretField";
import { requirePermission } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { recentRecordings, recordingPublic } from "@/lib/recording-store";
import { probeRecording, saveRecordings } from "./actions";

export default async function RecordingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("settings.connections");
  const query = await searchParams;
  const settings = recordingPublic();
  const rows = recentRecordings();
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">Integrations / Recorded messages</p>
        <h1>Recorded messages</h1>
        <p>Choose where SautiCall stores a copy of a recorded message. Amazon S3 and Google Cloud Storage are the two destinations. Until one is saved, messages stay in the phone app.</p>
        {query.saved ? <p className="form-feedback">{query.saved === "1" ? "Recording storage saved." : query.saved}</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <form className="ops-card ops-stack" action={saveRecordings}>
          <label>Destination
            <select name="provider" defaultValue={settings.provider}>
              <option value="off">Off</option>
              <option value="aws">Amazon S3</option>
              <option value="google">Google Cloud Storage</option>
            </select>
          </label>
          <label>Bucket <input name="bucket" defaultValue={settings.bucket} placeholder="sauticall-recordings" /></label>
          <label>Amazon region <input name="region" defaultValue={settings.region} placeholder="us-east-1" /></label>
          <label>Folder prefix <input name="prefix" defaultValue={settings.prefix} /></label>
          <label>Keep recordings (days) <input name="retention_days" type="number" min={1} max={3650} defaultValue={settings.retentionDays} /></label>
          <SecretField name="aws_access_key" label="Amazon access key id" stored={settings.awsKeyStored} />
          <SecretField name="aws_secret" label="Amazon secret access key" stored={settings.awsSecretStored} />
          <label>Google service account email <input name="google_email" defaultValue={settings.googleEmail} placeholder="recordings@project.iam.gserviceaccount.com" /></label>
          <SecretField name="google_key" label="Google private key" stored={settings.googleKeyStored} hint="Paste the private key, including BEGIN PRIVATE KEY" multiline />
          <p className="ops-muted">Secrets stay on this server. A saved key is not shown again. Leave a secret blank to keep the one already stored.</p>
          <button className="btn btn-primary" type="submit">Save storage</button>
        </form>
        <form action={probeRecording} className="ops-card">
          <h2>Check the destination</h2>
          <p>This writes a short text marker into the saved bucket. It does not place a call or copy a customer message.</p>
          <button className="btn btn-secondary" type="submit">Store a test marker</button>
        </form>
        <section className="ops-card">
          <h2>Recent copies</h2>
          {rows.length === 0 ? <p>No recording has been stored yet.</p> : (
            <table className="ops-table">
              <thead><tr><th>When</th><th>Customer ID</th><th>Kind</th><th>Destination</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWhen(row.created_at)}</td>
                    <td>{row.customer_code || "—"}</td>
                    <td>{row.kind}</td>
                    <td>{row.provider} {row.bucket}/{row.object_key}</td>
                    <td>{row.status}{row.detail ? ` · ${row.detail}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
