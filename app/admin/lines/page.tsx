import Link from "next/link";
import { checkTrunk, completeEmergency, completeTrunk, confirmTrunkCalls, linkTrunk, retryTrunk, sendEmergencyAddress, syncMinutes } from "../actions";
import { SipReveal } from "@/components/admin/OpsBits";
import { requirePermission } from "@/lib/access";
import { flagOn } from "@/lib/db";
import { formatAddress, parseEmergency } from "@/lib/e911";
import { formatDid, lineStatusLabel, listCompanies, listLines, maskCredential, trunkAdminSummary, trunkProgress, trunkTone, unmatchedTrunkLogs, type LineView } from "@/lib/phone-ops";
import { publishAllBoughtNumbers, scheduleAutomaticTrunks } from "@/lib/lines";
import { trunkAttemptLabel } from "@/lib/trunk-tries";

const E911: Record<string, string> = {
  missing: "Emergency address missing",
  saved: "Emergency address saved here",
  sent: "Emergency address sent to the phone company",
  needs_person: "Emergency address needs a review",
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
  const progress = trunkProgress({
    hasAccount: line.hasAccount,
    departmentOnPbx: line.departmentOnPbx,
    extensionOnPbx: line.extensionOnPbx,
    routeLabel: line.routeLabel,
    routeOnPbx: line.routeOnPbx,
    trunkId: line.trunkId,
    status: line.status,
    inboundOnPbx: line.inboundOnPbx,
    outboundOnPbx: line.outboundOnPbx,
    outboundAssigned: line.outboundAssigned,
    departmentLimited: line.departmentLimited,
  });
  const summary = trunkAdminSummary(progress);
  const sharedTrunk = line.siblings.filter((item) => line.trunkId && item.trunkId === line.trunkId);
  const steps = [
    ["Provider account", progress.provider],
    ["Department", progress.department],
    ["Default extension", progress.extension],
    ["Default route", progress.route],
    ["3CX trunk", progress.trunk],
    ["Inbound route", progress.inbound],
    ["Outbound rule", progress.outbound],
    ["Department limit", progress.limit],
  ] as const;
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
        {steps.map(([label, value]) => <li key={label}><span className={trunkTone(value)} /> {label} <strong>{value}</strong></li>)}
      </ul>
      <p>Automatic tries: <strong>{trunkAttemptLabel(line)}</strong>. Automatic tries stop after 3. Retry failed step is not limited.</p>
      {line.status === "trunk_waiting" ? (
        <div>
          <p className="ops-alert">{summary}{line.trunkId ? "" : line.attempts >= 3 ? " Automatic tries stopped at 3 of 3. Retry here as many times as you need, or create the trunk in 3CX and save its id." : ""}</p>
          <ol className="ops-steps">
            <li>Create department {line.department} on 3CX{line.from && line.to ? ` for extensions ${line.from}–${line.to}` : ""}.</li>
            <li>Create the default extension{line.extension ? ` ${line.extension}` : ""} from the account name and email.</li>
            <li>{line.routeLabel.startsWith("AI") ? `Use ${line.routeLabel} as the default route.` : "Create a ring group for that extension and use it as the default route."}</li>
            <li>Create a SIP trunk for {line.company}. Use registrar {line.sipHost || "the saved POP"}. The SIP user and password are below.</li>
            <li>Set the trunk default route for office hours and after hours to {line.routeLabel || "the ring group or AI receptionist"}.</li>
            <li>Add an outbound rule for extensions {line.from && line.to ? `${line.from}–${line.to}` : "the company’s reserved range"} and assign that rule to {line.department}.</li>
            <li>Limit the trunk to {line.department}.</li>
          </ol>
        </div>
      ) : null}
      {line.status === "trunk_done" ? <p className="ops-muted">An administrator recorded this as complete. Registration was not verified.</p> : null}
      <details className="ops-details" open={Boolean(line.message)}>
        <summary>Technical response</summary>
        <p>{line.message || "No technical response is saved."}</p>
      </details>
      <h3>Phone system trunk</h3>
      <p>{line.trunkId ? `3CX trunk id ${line.trunkId}${line.trunkNumber ? `, internal number ${line.trunkNumber}` : ""}.` : "No 3CX trunk id is stored yet."}</p>
      <h3>Routing configuration</h3>
      <dl className="ops-facts">
        <div><dt>Department</dt><dd>{line.departmentOnPbx ? `${line.department} on 3CX` : `${line.department} not on 3CX`}</dd></div>
        <div><dt>Default extension</dt><dd>{line.extensionOnPbx ? `Extension ${line.extension} on 3CX` : line.extension ? `Extension ${line.extension} not on 3CX` : "Not created"}</dd></div>
        <div><dt>Inbound destination</dt><dd>{line.routeLabel || "Not created"}</dd></div>
        <div><dt>Hours</dt><dd>Office hours and after hours</dd></div>
        <div><dt>Outbound scope</dt><dd>{line.from && line.to ? `Extensions ${line.from}–${line.to}, assigned to ${line.department}` : `Assigned to ${line.department}`}</dd></div>
        <div><dt>Trunk limit</dt><dd>{line.departmentLimited ? `Limited to ${line.department}` : `Not limited to ${line.department}`}</dd></div>
      </dl>
      <p className="ops-muted">{summary}</p>
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
          <button className="btn btn-primary" type="submit">Retry failed step</button>
        </form>
        <p className="ops-muted">Uses the VoIP.ms template already on 3CX, reuses this company’s SIP account and any trunk id already stored, and does not place a call. This retry does not count toward the 3 automatic tries.</p>
      </div>
      <form action={checkTrunk}>
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="company" value={line.userId} />
        <button className="btn btn-secondary" type="submit">Check trunk and routes in 3CX</button>
        <p className="ops-muted">Reads the department, registration, the inbound route, and the outbound rule from 3CX, then updates this line. It does not place a call and does not mark the trunk finished.</p>
      </form>
      <form action={confirmTrunkCalls}>
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="company" value={line.userId} />
        <button className="btn btn-secondary" type="submit">Record successful test calls</button>
        <p className="ops-muted">Available after the department limit, inbound route, and outbound rule are saved. 3CX must show the trunk registered. This does not place a call.</p>
      </form>
      <form action={linkTrunk} className="ops-stack">
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="company" value={line.userId} />
        <label>3CX trunk id <input name="trunk_id" inputMode="numeric" defaultValue={line.trunkId ? String(line.trunkId) : ""} placeholder="Id from the 3CX trunk" required /></label>
        <button className="btn btn-primary" type="submit">Save this trunk and try routing</button>
        <p className="ops-muted">Reads that trunk from 3CX, then tries the default route, the department limit, and the outbound rule. It does not place a call.</p>
      </form>
      <form action={completeTrunk} className="ops-stack">
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="company" value={line.userId} />
        <input type="hidden" name="trunk_id" value={line.trunkId || ""} />
        <label>Note <input name="note" placeholder="Inbound and outbound finished in 3CX" /></label>
        <button className="btn btn-secondary" type="submit">Record that routing was finished in 3CX</button>
        <p className="ops-muted">Use this after the inbound route and outbound rule exist in 3CX. Registration is not verified from here.</p>
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
  publishAllBoughtNumbers();
  scheduleAutomaticTrunks();
  const tab = params.tab === "numbers" || params.tab === "routing" ? params.tab : "trunks";
  const company = Number(params.company || params.user || 0);
  const rows = listLines(params.q || "", company, params.status || "");
  const logged = unmatchedTrunkLogs(params.q || "", company);
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
        <p className="ops-muted">{reading ? "Reading call minutes is on." : "Reading call minutes is off."} {trunks ? "Adding a 3CX trunk from here is on. A retry uses the customer's SIP account and does not place a call." : "Adding trunks from here is off, so a retry records the waiting step."} Each bought number gets 3 automatic trunk tries, then it waits here. An administrator can retry without that limit, check the routes in 3CX, or save a trunk created by hand. {flagOn("pbx.voipms_backup") ? "VoIP.ms backup is on for a confirmed trunk failure, and it uses that customer's client." : "VoIP.ms backup is off. Only an administrator can turn it on in Platform controls."}</p>
        {params.error ? <p className="form-feedback form-error" role="alert">{params.error}</p> : null}
        {params.saved === "recorded" ? <p className="form-feedback">The note was recorded. Registration was not verified.</p> : null}
        {params.saved === "calls" ? <p className="form-feedback">Test calls were recorded. The trunk was registered on 3CX. SautiCall did not place the calls.</p> : null}
        {params.saved === "linked" ? <p className="form-feedback">The trunk was read from 3CX and routing was saved. No call was placed.</p> : null}
        {params.saved === "checked" ? <p className="form-feedback">The trunk and routes were read from 3CX. No call was placed.</p> : null}
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
                <th>Tries</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={6}>No lines match.</td></tr> : null}
              {rows.map((row) => (
                <tr key={row.id} data-current={selected?.id === row.id ? "true" : undefined}>
                  <td><strong>{row.company}</strong><small>{row.siblings.length ? `${row.siblings.length + 1} numbers on this account` : "One number on this account"}</small></td>
                  {tab === "routing" ? <td>{row.routeLabel || "Not created"}</td> : <td>{formatDid(row.did)}</td>}
                  {tab === "routing" ? <td>{row.from && row.to ? `${row.from}–${row.to}` : "Reserved range"}</td> : <td>VoIP.ms</td>}
                  <td><span className={`ops-badge ${row.status === "trunk_live" ? "ok" : row.status === "trunk_waiting" ? "warn" : "muted"}`}>{tab === "routing" ? (row.inboundOnPbx && row.outboundOnPbx && row.departmentLimited ? "Routes on 3CX" : "Routes incomplete") : lineStatusLabel(row.status)}</span></td>
                  <td>{trunkAttemptLabel(row)}</td>
                  <td><Link className="btn btn-secondary" href={`/admin/lines?tab=${tab}&line=${row.id}&company=${company || ""}&status=${params.status || "all"}&q=${encodeURIComponent(params.q || "")}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-foot">{rows.length} {rows.length === 1 ? "line" : "lines"}.</p>
        <h2>Logged trunk attempts with no number line</h2>
        <p className="ops-muted">These trunk failures never matched a saved number. A retry needs a number line, so they stay here for tracing.</p>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr><th>Company</th><th>Subject</th><th>Logged tries</th><th>Latest note</th></tr>
            </thead>
            <tbody>
              {logged.length === 0 ? <tr><td colSpan={4}>No unmatched trunk logs.</td></tr> : null}
              {logged.map((row) => (
                <tr key={`${row.userId}-${row.subject}`}>
                  <td><strong>{row.company}</strong>{row.email ? <small>{row.email}</small> : null}</td>
                  <td>{row.subject}</td>
                  <td>{row.attempts}</td>
                  <td>{row.latest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected ? <LineDrawer line={(({ sipUser: _sipUser, ...rest }) => rest)(selected)} address={addressText(addressRow?.e911_json || "")} maskedUser={maskCredential(selected.sipUser)} /> : null}
    </div>
  );
}
