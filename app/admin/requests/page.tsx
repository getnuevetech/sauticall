import { orderSavedNumber, refreshPortStatus, setRequestStatus } from "../actions";
import { flagOn, getDb } from "@/lib/db";

type Row = { id: number; email: string; kind: string; payload: string; status: string; provider_ref: string; staff_note: string; created_at: string };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const rows = getDb().prepare(
    `SELECT r.id, u.email, r.kind, r.payload, r.status, r.provider_ref, r.staff_note, r.created_at
     FROM account_requests r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 50`,
  ).all() as Row[];
  const ordering = flagOn("numbers.live_order");
  return (
    <>
      <span className="eyebrow">REQUESTS</span>
      <h2>Numbers and transfers</h2>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {rows.length === 0 ? <p>No requests yet.</p> : null}
      {rows.map((row) => {
        const payload = JSON.parse(row.payload) as { did?: string; detail?: string; numbers?: string };
        return (
          <article key={row.id} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{row.kind === "number" ? "Number" : "Transfer"} · {payload.did || payload.numbers || payload.detail}</h3>
            <p>{row.email} · {row.status}{row.provider_ref ? ` · ${row.provider_ref}` : ""}</p>
            <p>{row.staff_note}</p>
            <form action={setRequestStatus} className="form-grid">
              <input type="hidden" name="id" value={row.id} />
              <label>Status
                <select name="status" defaultValue={row.status}>
                  {["requested", "submitted", "ordered", "completed", "exception", "cancelled"].map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>Note <input name="staff_note" defaultValue={row.staff_note} /></label>
              <button className="btn btn-secondary" type="submit">Update</button>
            </form>
            {row.kind === "number" && payload.did ? (
              <form action={orderSavedNumber}>
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-primary" type="submit" disabled={!ordering}>{ordering ? "Order from VoIP.ms" : "Live ordering is off"}</button>
              </form>
            ) : null}
            {row.kind === "port" && row.provider_ref ? (
              <form action={refreshPortStatus}>
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-secondary" type="submit">Refresh carrier status</button>
              </form>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
