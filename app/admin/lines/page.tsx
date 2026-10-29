import Link from "next/link";
import { completeEmergency, completeTrunk, retryTrunk, sendEmergencyAddress, syncMinutes } from "../actions";
import { SipReveal } from "@/components/admin/OpsBits";
import { requirePermission } from "@/lib/access";
import { flagOn } from "@/lib/db";
import { formatAddress, parseEmergency } from "@/lib/e911";
import { formatDid, lineStatusLabel, listCompanies, listLines, maskCredential, trunkStep, type LineView } from "@/lib/phone-ops";

const E911: Record<string, string> = {
  missing: "Emergency address missing",
  saved: "Emergency address saved here",
  sent: "Emergency address sent to the phone company",
  needs_person: "Emergency address needs a person",
  done: "Emergency address marked done",
};

function addressText(raw: string) {
  try {
    const parsed = parseEmergency(JSON.parse(raw) as Record<string, string>);
    return parsed.ok ? formatAddress(parsed.address) : "";
  } catch {
    return "";
  }
}

function LineDrawer({ line, address, maskedUser }: { line: Omit<LineView, "sipUser">; address: string; maskedUser: string }) {
  const steps = trunkStep({ hasAccount: line.hasAccount, trunkId: line.trunkId, status: line.status });
  const sharedTrunk = line.siblings.filter((item) => line.trunkId && item.trunkId === line.trunkId);
  return (
    <aside className="ops-drawer">
      <div className="ops-drawer-head">
        <div>
          <p className="ops-kicker">Trunk details</p>
          <h2>{line.company}</h2>
          <p>{formatDid(line.did)}</p>
        </div>
        <Link href="/admin/lines" aria-label="Close">×</Link>
      </div>
      <p><Link href={`/admin/customers/${line.userId}`}>{line.email}</Link></p>
      <h3>Provisioning steps</h3>
      <ul className="ops-steps">
        <li><span className={steps.provider === "Ready" ? "ok" : "bad"} /> Provider account <strong>{steps.provider}</strong></li>
        <li><span className={steps.trunk === "Failed" ? "bad" : steps.trunk === "Ready" ? "ok" : "muted"} /> 3CX trunk <strong>{steps.trunk}</strong></li>
        <li><span className="muted" /> Routing <strong>{steps.routing}</strong></li>
      </ul>
      {line.status === "trunk_waiting" ? <p className="ops-alert">3CX rejected the request, or a later step is still open. The technical response is below.</p> : null}
      {line.status === "trunk_done" ? <p className="ops-muted">An administrator recorded this as complete. Registration was not verified.</p> : null}
      <details className="ops-details" open={Boolean(line.message)}>
        <summary>Technical response</summary>
        <p>{line.message || "No technical response is saved."}</p>
      </details>
      <h3>Routing configuration</h3>
      <dl className="ops-facts">
        <div><dt>Inbound destination</dt><dd>{line.extension ? `Extension ${line.extension}` : "Not saved"}</dd></div>
        <div><dt>Outbound scope</dt><dd>{line.from && line.to ? `Extensions ${line.from}–${line.to}` : "The company’s reserved range"}</dd></div>
      </dl>
      <p className="ops-muted">Saved configuration. Not verified live.</p>
      <h3>Assigned numbers</h3>
      <p>{formatDid(line.did)} is this line. {line.siblings.length ? `${line.siblings.length} other number${line.siblings.length === 1 ? "" : "s"} use this company’s provider account.` : "No other number is on this provider account."}</p>
      {sharedTrunk.length ? <p>{sharedTrunk.map((item) => formatDid(item.did)).join(", ")} {sharedTrunk.length === 1 ? "is" : "are"} on the same phone-system trunk.</p> : null}
      <ul className="ops-members">
        {line.siblings.map((item) => <li key={item.id}><Link href={`/admin/lines?line=${item.id}`}>{formatDid(item.did)}</Link>{item.trunkId && item.trunkId === line.trunkId ? " · same trunk" : ""}</li>)}
      </ul>
      <h3>SIP connection</h3>
      <p>Server {line.sipHost || "Not saved"}</p>
      <SipReveal company={line.userId} label="Username" masked={maskedUser} which="user" />
      <SipReveal company={line.userId} label="Password" masked={line.hasAccount ? "••••••••" : ""} which="pass" />
      <p className="ops-muted">Reveal uses the lines permission and is recorded in the audit log. The password is not included in this page.</p>
      <div className="ops-actions">
        <form action={retryTrunk}>
          <input type="hidden" name="id" value={line.id} />
          <input type="hidden" name="company" value={line.userId} />
          <button className="btn btn-primary" type="submit">Review & retry 3CX setup</button>
        </form>
        <p className="ops-muted">Checks for an existing trunk before retrying. It continues at the step that is still open.</p>
      </div>
      <form action={completeTrunk} className="ops-stack">
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="company" value={line.userId} />
        <label>Note <input name="note" placeholder="What was finished on the server" /></label>
        <button className="btn btn-secondary" type="submit">Record manual completion with note</button>
        <p className="ops-muted">This records an administrator’s action. It does not imply verified registration.</p>
      </form>
      {line.requestId ? <p><Link href={`/admin/requests?request=${line.requestId}`}>Open the number request</Link></p> : <p>No number request is linked to this line.</p>}
      <details className="ops-details">
        <summary>Emergency address · {E911[line.e911] || line.e911}</summary>
        <p>{address || "No address is saved."}</p>
        {line.e911Message ? <p>{line.e911Message}</p> : null}
        <form action={sendEmergencyAddress}>
          <input type="hidden" name="id" value={line.id} />
          <input type="hidden" name="company" value={line.userId} />
          <button className="btn btn-secondary" type="submit">Send emergency address</button>
        </form>
        <form action={completeEmergency} className="ops-stack">
          <input type="hidden" name="id" value={line.id} />
          <input type="hidden" name="company" value={line.userId} />
          <label>Note <input name="note" placeholder="Entered on the phone company" /></label>
          <button className="btn btn-secondary" type="submit">Mark the emergency address as done</button>
        </form>
      </details>
    </aside>
  );
}

export default async function LinesPage({ searchParams }: { searchParams: Promise<{ q?: string; company?: string; user?: string; status?: string; tab?: string; line?: string; error?: string; saved?: string }> }) {
  await requirePermission("settings.lines");
  const params = await searchParams;
  const tab = params.tab === "numbers" || params.tab === "routing" ? params.tab : "trunks";
  const company = Number(params.company || params.user || 0);
  const rows = listLines(params.q || "", company, params.status || "");
  const companies = listCompanies();
  const selected = rows.find((row) => row.id === Number(params.line));
  const addressRow = selected ? (await import("@/lib/db")).getDb().prepare("SELECT e911_json FROM phone_lines WHERE id = ? AND user_id = ?").get(selected.id, selected.userId) as { e911_json: string } | undefined : undefined;
  const reading = flagOn("minutes.live_sync");
  const trunks = flagOn("pbx.live_trunk");
  return (
    <div className={`ops${selected ? "" : " ops-single"}`}>
      <div>
        <p className="ops-kicker">Phone operations / Lines & trunks</p>
        <div className="ops-head">
          <div>
            <h1>Lines & trunks</h1>
            <p>Manage company connections and phone-system provisioning. A company can have several numbers, and more than one number can share a trunk.</p>
          </div>
          <form action={syncMinutes}><button className="btn btn-secondary" type="submit">Read minutes</button></form>
        </div>
        <p className="ops-muted">{reading ? "Reading call minutes is on." : "Reading call minutes is off."} {trunks ? "Adding trunks from here is on." : "Adding trunks from here is off, so a retry records the waiting step."}</p>
        {params.error ? <p className="form-feedback">{params.error}</p> : null}
        {params.saved === "recorded" ? <p className="form-feedback">The note was recorded. Registration was not verified.</p> : null}
        {params.saved === "1" ? <p className="form-feedback">Call minutes were updated.</p> : null}
        <nav className="ops-tabs">
          <Link href="/admin/lines?tab=trunks" data-current={tab === "trunks" ? "true" : undefined}>Trunks</Link>
          <Link href="/admin/lines?tab=numbers" data-current={tab === "numbers" ? "true" : undefined}>Assigned numbers</Link>
          <Link href="/admin/lines?tab=routing" data-current={tab === "routing" ? "true" : undefined}>Routing</Link>
        </nav>
        <form className="ops-toolbar" method="get">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={params.q || ""} placeholder="Search company number or trunk" aria-label="Search company number or trunk" />
          <select name="company" defaultValue={String(company || "")} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="status" defaultValue={params.status || "all"} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="trunk_waiting">Needs attention</option>
            <option value="ordered">Pending</option>
            <option value="trunk_live">Provisioned</option>
            <option value="trunk_done">Recorded manually</option>
          </select>
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Company</th>
                {tab === "routing" ? <th>Inbound</th> : <th>Linked number</th>}
                {tab === "routing" ? <th>Outbound scope</th> : <th>Provider</th>}
                <th>{tab === "routing" ? "Verification" : "Phone system"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={5}>No lines match.</td></tr> : null}
              {rows.map((row) => (
                <tr key={row.id} data-current={selected?.id === row.id ? "true" : undefined}>
                  <td><strong>{row.company}</strong><small>{row.siblings.length ? `${row.siblings.length + 1} numbers on this account` : "One number on this account"}</small></td>
                  {tab === "routing" ? <td>{row.extension ? `Extension ${row.extension}` : "Not saved"}</td> : <td>{formatDid(row.did)}</td>}
                  {tab === "routing" ? <td>{row.from && row.to ? `${row.from}–${row.to}` : "Reserved range"}</td> : <td>VoIP.ms</td>}
                  <td><span className={`ops-badge ${row.status === "trunk_live" ? "ok" : row.status === "trunk_waiting" ? "warn" : "muted"}`}>{tab === "routing" ? "Not verified" : lineStatusLabel(row.status)}</span></td>
                  <td><Link className="btn btn-secondary" href={`/admin/lines?tab=${tab}&line=${row.id}&company=${company || ""}&status=${params.status || "all"}&q=${encodeURIComponent(params.q || "")}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-foot">{rows.length} {rows.length === 1 ? "line" : "lines"}.</p>
      </div>
      {selected ? <LineDrawer line={(({ sipUser: _sipUser, ...rest }) => rest)(selected)} address={addressText(addressRow?.e911_json || "")} maskedUser={maskCredential(selected.sipUser)} /> : null}
    </div>
  );
}
