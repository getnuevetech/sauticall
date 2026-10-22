import { orderSavedNumber, refreshPortStatus, setRequestStatus } from "../actions";
import { formatAddress, parseEmergency } from "@/lib/e911";
import { requestStatusLabel, requestStatuses } from "@/lib/admin-labels";
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
      <span className="eyebrow">Inbox</span>
      <h2>Number and transfer requests</h2>
      <p>These are requests from customers. Buying a number only happens when you press the button, and only if buying is turned on.</p>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {rows.length === 0 ? <p>No requests yet.</p> : null}
      {rows.map((row) => {
        const payload = JSON.parse(row.payload) as { did?: string; detail?: string; numbers?: string; emergency?: Record<string, string> };
        const emergency = payload.emergency ? parseEmergency(payload.emergency) : null;
        return (
          <article key={row.id} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{row.kind === "number" ? "Number" : "Transfer"} · {payload.did || payload.numbers || payload.detail}</h3>
            {emergency?.ok ? <p>Emergency address: {formatAddress(emergency.address)}</p> : row.kind === "number" ? <p>No emergency address on this request.</p> : null}
            <p>{row.email} · {requestStatusLabel(row.status)}{row.provider_ref ? ` · ${row.provider_ref}` : ""}</p>
            {row.staff_note ? <p>{row.staff_note}</p> : null}
            <form action={setRequestStatus} className="form-grid">
              <input type="hidden" name="id" value={row.id} />
              <label>Status
                <select name="status" defaultValue={row.status}>
                  {requestStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label>Note for the team <input name="staff_note" defaultValue={row.staff_note} /></label>
              <button className="btn btn-secondary" type="submit">Save</button>
            </form>
            {row.kind === "number" && payload.did ? (
              <form action={orderSavedNumber}>
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-primary" type="submit" disabled={!ordering}>{ordering ? "Buy this number" : "Buying numbers is turned off"}</button>
              </form>
            ) : null}
            {row.kind === "port" && row.provider_ref ? (
              <form action={refreshPortStatus}>
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-secondary" type="submit">Check transfer progress</button>
              </form>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
