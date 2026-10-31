import Link from "next/link";
import { after } from "next/server";
import { orderSavedNumber, refreshPortStatus, setRequestStatus } from "../actions";
import { RefreshWhileBuying } from "@/components/admin/RefreshWhileBuying";
import { requirePermission } from "@/lib/access";
import { requestStatusLabel, requestStatuses } from "@/lib/admin-labels";
import { flagOn, getDb } from "@/lib/db";
import { formatAddress, parseEmergency } from "@/lib/e911";
import { numberIsBought, numberPurchaseMode } from "@/lib/number-order";
import { reconcileBoughtNumbers } from "@/lib/number-purchase";
import { formatDid } from "@/lib/phone-ops";

type Row = { id: number; user_id: number; email: string; name: string; kind: string; payload: string; status: string; provider_ref: string; staff_note: string; created_at: string };

function relativeTime(iso: string) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; kind?: string; status?: string; request?: string }> }) {
  await requirePermission("inbox.requests");
  after(() => reconcileBoughtNumbers());
  const params = await searchParams;
  const rows = getDb().prepare(
    `SELECT r.id, r.user_id, u.email, u.name, r.kind, r.payload, r.status, r.provider_ref, r.staff_note, r.created_at
     FROM account_requests r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 100`,
  ).all() as Row[];
  const ordering = flagOn("numbers.live_order");
  const buying = rows.some((row) => row.status === "ordering");
  const purchase = numberPurchaseMode(ordering, flagOn("numbers.auto_order"));
  const intro = purchase === "automatic"
    ? "Automatic purchasing is enabled. Provider actions and internal updates are tracked separately."
    : purchase === "manual"
      ? "Automatic purchasing is off. Buying a number happens when you press the button. Changing the status does not buy it."
      : "Buying numbers is turned off. Changing the status does not buy a number.";
  const needle = (params.q || "").trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (params.kind === "number" && row.kind !== "number") return false;
    if (params.kind === "port" && row.kind !== "port") return false;
    if (params.status && params.status !== "all" && row.status !== params.status) return false;
    if (!needle) return true;
    return `${row.email} ${row.name} ${row.payload}`.toLowerCase().includes(needle);
  });
  const selected = visible.find((row) => row.id === Number(params.request));
  let payload: { did?: string; detail?: string; numbers?: string; emergency?: Record<string, string>; plan?: string } = {};
  if (selected) {
    try { payload = JSON.parse(selected.payload) as typeof payload; } catch { payload = {}; }
  }
  const emergency = payload.emergency ? parseEmergency(payload.emergency) : null;
  const bought = selected?.kind === "number" && payload.did ? numberIsBought(selected.status, selected.provider_ref, payload.did) : false;
  const line = selected ? getDb().prepare("SELECT id, status FROM phone_lines WHERE request_id = ? AND user_id = ?").get(selected.id, selected.user_id) as { id: number; status: string } | undefined : undefined;
  return (
    <div className={`ops${selected ? "" : " ops-single"}`}>
      <div>
        <p className="ops-kicker">Phone operations / Number requests</p>
        <h1>Number requests</h1>
        <p>Track number purchases and inbound transfers.</p>
        <p className="ops-banner">{intro}</p>
        {buying ? <RefreshWhileBuying /> : null}
        {params.error ? <p className="form-feedback form-error" role="alert">{params.error}</p> : null}
        <nav className="ops-tabs">
          <Link href="/admin/requests?kind=all" data-current={!params.kind || params.kind === "all" ? "true" : undefined}>All requests</Link>
          <Link href="/admin/requests?kind=number" data-current={params.kind === "number" ? "true" : undefined}>Purchases</Link>
          <Link href="/admin/requests?kind=port" data-current={params.kind === "port" ? "true" : undefined}>Transfers</Link>
        </nav>
        <form className="ops-toolbar" method="get">
          <input type="hidden" name="kind" value={params.kind || "all"} />
          <input name="q" defaultValue={params.q || ""} placeholder="Search number or customer" aria-label="Search number or customer" />
          <select name="status" defaultValue={params.status || "all"} aria-label="Status">
            <option value="all">All statuses</option>
            {requestStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Number</th><th>Customer</th><th>Type</th><th>Provider status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {visible.length === 0 ? <tr><td colSpan={6}>No requests match.</td></tr> : null}
              {visible.map((row) => {
                let item: { did?: string; numbers?: string } = {};
                try { item = JSON.parse(row.payload) as { did?: string; numbers?: string }; } catch { item = {}; }
                const label = item.did ? formatDid(item.did) : item.numbers || (row.kind === "setup" ? "Signup" : "Request");
                const kind = row.kind === "number" ? "Purchase" : row.kind === "port" ? "Transfer" : "Signup";
                const provider = row.kind === "number" && item.did && (row.status === "ordered" || row.status === "completed") && !numberIsBought(row.status, row.provider_ref, item.did) ? "Not confirmed" : requestStatusLabel(row.status);
                return (
                  <tr key={row.id} data-current={selected?.id === row.id ? "true" : undefined}>
                    <td>{label}</td>
                    <td>{row.name || row.email}</td>
                    <td>{kind}</td>
                    <td><span className={`ops-badge ${row.status === "ordered" || row.status === "completed" ? "ok" : row.status === "exception" ? "warn" : "muted"}`}>{provider}</span></td>
                    <td>{relativeTime(row.created_at)}</td>
                    <td><Link className="btn btn-secondary" href={`/admin/requests?request=${row.id}&kind=${params.kind || "all"}&status=${params.status || "all"}&q=${encodeURIComponent(params.q || "")}`}>View</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ops-foot"><Link href="/admin/failures?area=number">Open failed number orders</Link></p>
      </div>
      {selected ? (
        <aside className="ops-drawer">
          <div className="ops-drawer-head">
            <div>
              <p className="ops-kicker">Request details</p>
              <h2>{payload.did ? formatDid(payload.did) : payload.numbers || "Request"}</h2>
            </div>
            <Link href="/admin/requests" aria-label="Close">×</Link>
          </div>
          <dl className="ops-facts">
            <div><dt>Customer</dt><dd><Link href={`/admin/customers/${selected.user_id}`}>{selected.name || selected.email}</Link></dd></div>
            <div><dt>Request ID</dt><dd>{selected.id}</dd></div>
          </dl>
          <h3>Provider record</h3>
          <dl className="ops-facts">
            <div><dt>Provider</dt><dd>VoIP.ms</dd></div>
            <div><dt>Provider status</dt><dd>{bought ? "Purchased" : requestStatusLabel(selected.status)}</dd></div>
          </dl>
          <p className="ops-muted">Provider-confirmed purchase does not confirm phone-system readiness.</p>
          <h3>Connection status</h3>
          <p>Phone system status: {line ? lineStatus(line.status) : "Not linked"}</p>
          {line ? <p><Link href={`/admin/lines?line=${line.id}&company=${selected.user_id}`}>Open this line</Link></p> : null}
          <details className="ops-details">
            <summary>Emergency address</summary>
            <p>{emergency?.ok ? formatAddress(emergency.address) : "No emergency address on this request."}</p>
          </details>
          <h3>Internal tracking</h3>
          <form action={setRequestStatus} className="ops-stack">
            <input type="hidden" name="id" value={selected.id} />
            <label>Tracking status
              <select name="status" defaultValue={selected.status}>
                {requestStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
            <p className="ops-muted">Internal tracking only. Does not buy or activate a number.</p>
            <label>Team note <textarea name="staff_note" maxLength={400} defaultValue={selected.staff_note} rows={3} /></label>
            <button className="btn btn-primary" type="submit">Save internal update</button>
          </form>
          {selected.status === "ordering" ? <p>Buying this number. This page updates when it finishes.</p> : null}
          {selected.kind === "number" && payload.did && selected.status !== "cancelled" && selected.status !== "ordering" && !bought ? (
            <form action={orderSavedNumber}>
              <input type="hidden" name="id" value={selected.id} />
              <button className="btn btn-primary" type="submit" disabled={!ordering}>{ordering ? "Buy this number" : "Buying numbers is turned off"}</button>
            </form>
          ) : null}
          {selected.kind === "port" && selected.provider_ref ? (
            <form action={refreshPortStatus}>
              <input type="hidden" name="id" value={selected.id} />
              <button className="btn btn-secondary" type="submit">Check transfer progress</button>
            </form>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

function lineStatus(status: string) {
  if (status === "trunk_live") return "Provisioned";
  if (status === "trunk_waiting") return "Needs attention";
  if (status === "trunk_done") return "Recorded manually";
  return "Not verified";
}
