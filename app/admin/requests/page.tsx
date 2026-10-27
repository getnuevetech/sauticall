import { orderSavedNumber, refreshPortStatus, setRequestStatus } from "../actions";
import { requirePermission } from "@/lib/access";
import { formatAddress, parseEmergency } from "@/lib/e911";
import { requestStatusLabel, requestStatuses } from "@/lib/admin-labels";
import { flagOn, getDb } from "@/lib/db";
import { numberIsBought, numberPurchaseMode } from "@/lib/number-order";
import { reconcileBoughtNumbers } from "@/lib/number-purchase";
import Link from "next/link";
import { after } from "next/server";

type Row = { id: number; email: string; kind: string; payload: string; status: string; provider_ref: string; staff_note: string; created_at: string };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("inbox.requests");
  after(() => reconcileBoughtNumbers());
  const params = await searchParams;
  const rows = getDb().prepare(
    `SELECT r.id, u.email, r.kind, r.payload, r.status, r.provider_ref, r.staff_note, r.created_at
     FROM account_requests r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 50`,
  ).all() as Row[];
  const ordering = flagOn("numbers.live_order");
  const purchase = numberPurchaseMode(ordering, flagOn("numbers.auto_order"));
  const intro = purchase === "automatic"
    ? "Automatic buying is on. A customer request is sent to the phone company immediately. Bought means that company has the number. Changing the status does not buy it."
    : purchase === "manual"
      ? "Automatic buying is off. Buying a number happens when you press the button. Bought means the phone company has the number. Changing the status does not buy it."
      : "Buying numbers is turned off. Requests stay here until live number ordering is on. Changing the status does not buy a number.";
  return (
    <>
      <span className="eyebrow">Customers</span>
      <h2>Number and transfer requests</h2>
      <p>{intro}</p>
      <p><Link href="/admin/failures?area=number">Open failed number orders</Link></p>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {rows.length === 0 ? <p>No requests yet.</p> : null}
      {rows.map((row) => {
        let payload: { did?: string; detail?: string; numbers?: string; emergency?: Record<string, string>; plan?: string; prompt?: string } = {};
        try {
          payload = JSON.parse(row.payload) as { did?: string; detail?: string; numbers?: string; emergency?: Record<string, string>; plan?: string; prompt?: string };
        } catch {
          payload = {};
        }
        const emergency = payload.emergency ? parseEmergency(payload.emergency) : null;
        const kind = row.kind === "number" ? "Number" : row.kind === "setup" ? "Signup" : "Transfer";
        return (
          <article key={row.id} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{kind} · {payload.plan || payload.did || payload.numbers || payload.detail || "Request"}</h3>
            {payload.prompt ? <p>{payload.prompt}</p> : null}
            {emergency?.ok ? <p>Emergency address: {formatAddress(emergency.address)}</p> : row.kind === "number" ? <p>No emergency address on this request.</p> : null}
            <p>{row.email} · {row.kind === "number" && payload.did && (row.status === "ordered" || row.status === "completed") && !numberIsBought(row.status, row.provider_ref, payload.did) ? "Not confirmed on the phone company" : requestStatusLabel(row.status)}{row.provider_ref ? ` · ${row.provider_ref}` : ""}</p>
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
            {row.kind === "number" && payload.did && row.status !== "cancelled" && !numberIsBought(row.status, row.provider_ref, payload.did) ? (
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
