import { provisionPerson } from "../actions";
import { flagOn, getDb } from "@/lib/db";

type Row = { id: number; email: string; number: string; first_name: string; last_name: string; status: string; xapi_id: number; last_message: string };

export default async function AdminPhonePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const live = flagOn("pbx.live_provision");
  const rows = getDb().prepare(
    `SELECT e.id, u.email, e.number, e.first_name, e.last_name, e.status, e.xapi_id, e.last_message
     FROM pbx_extensions e JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 100`,
  ).all() as Row[];
  return (
    <>
      <span className="eyebrow">Phone system</span>
      <h2>Extensions</h2>
      <p>Each customer gets their own department on 3CX. Daytime calls go to their first extension. After hours they go to voicemail. Creating people on the phone system stays off until you turn that switch on.</p>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {rows.length === 0 ? <p>No one has been added yet.</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="feature-card" style={{ marginBottom: 16 }}>
          <h3>Extension {row.number} · {row.first_name} {row.last_name}</h3>
          <p>{row.email} · {row.status === "created" ? "On the phone system" : row.status === "failed" ? "Needs attention" : "Waiting"}{row.xapi_id ? ` · ${row.xapi_id}` : ""}</p>
          {row.last_message ? <p>{row.last_message}</p> : null}
          {row.status !== "created" ? (
            <form action={provisionPerson}>
              <input type="hidden" name="id" value={row.id} />
              <button className="btn btn-primary" type="submit" disabled={!live}>{live ? "Create on the phone system" : "Creating people is turned off"}</button>
            </form>
          ) : null}
        </article>
      ))}
    </>
  );
}
