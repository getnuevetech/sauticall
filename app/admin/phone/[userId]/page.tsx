import Link from "next/link";
import { notFound } from "next/navigation";
import { completeGroup, provisionPerson, removePersonRecord, retryGroup } from "../../actions";
import { CompanyJump, ConfirmRemove } from "@/components/admin/OpsBits";
import { requirePermission } from "@/lib/access";
import { flagOn, getDb } from "@/lib/db";
import { companyChoices, companyRouting, listGroups, listPeople, personState, type GroupView, type PersonRow } from "@/lib/phone-ops";

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "•";
}

function PersonDrawer({ person, company, live }: { person: PersonRow; company: number; live: boolean }) {
  const state = personState(person.status);
  return (
    <aside className="ops-drawer">
      <div className="ops-drawer-head">
        <div>
          <p className="ops-kicker">Extension {person.number}</p>
          <h2>{person.first} {person.last}</h2>
        </div>
        <Link href={`/admin/phone/${company}?tab=extensions`} aria-label="Close">×</Link>
      </div>
      <p>{person.email}</p>
      <dl className="ops-facts">
        <div><dt>Saved record</dt><dd>Present</dd></div>
        <div><dt>Phone-system state</dt><dd><span className={`ops-badge ${state.tone}`}>{state.detail}</span></dd></div>
      </dl>
      {person.status === "failed" ? <p className="ops-alert">Phone system rejected the request. The technical response is below.</p> : null}
      <details className="ops-details">
        <summary>Technical details</summary>
        <p>{person.message || "No technical response is saved."}</p>
      </details>
      <p className="ops-muted">Last checked live: not checked from this page. Creating or reviewing asks the phone system at that moment.</p>
      {person.status !== "created" && person.status !== "removed" ? (
        <form action={provisionPerson}>
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="company" value={company} />
          <button className="btn btn-primary ops-wide" type="submit" disabled={!live}>{person.status === "failed" ? "Review provisioning issue" : "Create on phone system"}</button>
          <p className="ops-muted">Checks for an existing phone-system record before creating.</p>
        </form>
      ) : null}
      {person.status !== "removed" ? (
        <div className="ops-danger">
          <h3>Danger zone</h3>
          <ConfirmRemove action={removePersonRecord} id={person.id} company={company} />
          <p className="ops-muted">Keep in SautiCall, remove from the phone system.</p>
        </div>
      ) : <p>This record was kept after the phone-system entry was removed.</p>}
    </aside>
  );
}

function GroupDrawer({ group, company, companyName, live }: { group: GroupView; company: number; companyName: string; live: boolean }) {
  const state = personState(group.status);
  const tab = group.kind === "queue" ? "queues" : "groups";
  return (
    <aside className="ops-drawer">
      <div className="ops-drawer-head">
        <div>
          <p className="ops-kicker">{group.kind === "queue" ? "Call queue" : "Ring group"}</p>
          <h2>{group.name}</h2>
        </div>
        <Link href={`/admin/phone/${company}?tab=${tab}`} aria-label="Close">×</Link>
      </div>
      <dl className="ops-facts">
        <div><dt>Company</dt><dd>{companyName}</dd></div>
        <div><dt>Extension</dt><dd>{group.number}</dd></div>
      </dl>
      <h3>Members ({group.members.length})</h3>
      <ul className="ops-members">
        {group.members.length === 0 ? <li>No people in this group.</li> : null}
        {group.members.map((member) => (
          <li key={member.number}><span>{initials(member.first, member.last)}</span>{member.first} {member.last} · {member.number}</li>
        ))}
      </ul>
      <h3>Saved configuration</h3>
      <dl className="ops-facts">
        <div><dt>Strategy</dt><dd>{group.strategy}</dd></div>
        <div><dt>Daytime routing</dt><dd>{group.answers ? "Selected target" : "Not the daytime target"}</dd></div>
      </dl>
      <p className="ops-alert quiet">Phone-system state: {state.detail}. {group.message ? "The phone system rejected the request." : "Routing changes are not confirmed until verified on the phone system."}</p>
      <details className="ops-details">
        <summary>Technical response</summary>
        <p>{group.message || "No technical response is saved."}</p>
      </details>
      {group.status !== "created" && group.status !== "manual" ? (
        <>
          <form action={retryGroup}>
            <input type="hidden" name="id" value={group.id} />
            <input type="hidden" name="company" value={company} />
            <button className="btn btn-primary" type="submit" disabled={!live}>Review provisioning</button>
          </form>
          <p className="ops-muted">Checks for an existing phone-system group before creating one.</p>
          <form action={completeGroup} className="ops-stack">
            <input type="hidden" name="id" value={group.id} />
            <input type="hidden" name="company" value={company} />
            <label>Note <input name="note" placeholder="Built on the phone system" /></label>
            <button className="btn btn-secondary" type="submit">Record manual completion</button>
            <p className="ops-muted">This records an administrator’s action. It does not verify the group.</p>
          </form>
        </>
      ) : null}
      <Link href={`/admin/phone/${company}?tab=routing`}>View routing</Link>
    </aside>
  );
}

export default async function CompanyPhonePage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ tab?: string; q?: string; status?: string; removed?: string; ext?: string; group?: string; error?: string; saved?: string }> }) {
  await requirePermission("settings.phone");
  const { userId } = await params;
  const companyId = Number(userId);
  const company = getDb().prepare(
    `SELECT u.id, u.name, u.email, COALESCE(d.name, '') AS department, COALESCE(d.xapi_id, 0) AS live, COALESCE(d.number_from, '') AS number_from, COALESCE(d.number_to, '') AS number_to
     FROM users u LEFT JOIN pbx_departments d ON d.user_id = u.id
     WHERE u.id = ? AND u.role = 'customer'`,
  ).get(companyId) as { id: number; name: string; email: string; department: string; live: number; number_from: string; number_to: string } | undefined;
  if (!company) notFound();
  const query = await searchParams;
  const tab = query.tab === "groups" || query.tab === "queues" || query.tab === "routing" ? query.tab : "extensions";
  const live = flagOn("pbx.live_provision");
  const people = listPeople(companyId, query.q || "", query.status || "", query.removed === "1");
  const kind = tab === "queues" ? "queue" : "ring";
  const groups = tab === "groups" || tab === "queues" ? listGroups(companyId, kind, query.q || "", query.status || "") : [];
  const selectedPerson = people.find((person) => person.id === Number(query.ext));
  const selectedGroup = groups.find((group) => group.id === Number(query.group));
  const routing = companyRouting(companyId);
  const allowance = getDb().prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ? AND status != 'removed'").get(companyId) as { n: number };
  const { paidPlan } = await import("@/lib/pbx");
  const { extensionCapacity } = await import("@/lib/plan-features");
  const plan = paidPlan(companyId);
  const cap = plan ? extensionCapacity(plan) : 0;
  const href = (next: string, extra = "") => `/admin/phone/${companyId}?tab=${next}${extra}`;
  return (
    <div className={`ops${selectedPerson || selectedGroup ? "" : " ops-single"}`}>
      <div>
        <p className="ops-kicker">{company.email} · Department {company.department || "company name not set"}</p>
        <div className="ops-head">
          <h1>{company.name || company.email}</h1>
          <CompanyJump companies={companyChoices()} current={companyId} />
          <Link className="btn btn-secondary" href="/admin/phone/numbering">Global numbering settings</Link>
        </div>
        {query.error ? <p className="form-feedback">{query.error}</p> : null}
        {query.saved === "removed" ? <p className="form-feedback">Removed from the phone system. The SautiCall record was kept.</p> : null}
        {query.saved === "recorded" ? <p className="form-feedback">The administrator’s note was recorded. The phone system was not rechecked.</p> : null}
        <div className="ops-stats">
          <div><span>Extension allowance</span><strong>{allowance.n} / {cap || "—"}</strong><i style={{ width: `${cap ? Math.min(100, (allowance.n / cap) * 100) : 0}%` }} /></div>
          <div><span>Department status</span><strong>{company.live ? "Provisioned" : "Not on phone system"}</strong></div>
          <div><span>Reserved numbers</span><strong>{company.number_from && company.number_to ? `${company.number_from}–${company.number_to}` : "Using the global plan"}</strong></div>
        </div>
        <nav className="ops-tabs">
          <Link href={href("extensions")} data-current={tab === "extensions" ? "true" : undefined}>Extensions</Link>
          <Link href={href("groups")} data-current={tab === "groups" ? "true" : undefined}>Ring groups</Link>
          <Link href={href("queues")} data-current={tab === "queues" ? "true" : undefined}>Call queues</Link>
          <Link href={href("routing")} data-current={tab === "routing" ? "true" : undefined}>Routing</Link>
        </nav>
        {tab === "routing" ? (
          <section className="ops-card">
            <h2>Saved routing</h2>
            <p>Daytime: {routing.daytime}. {routing.daytimeNote}</p>
            <p>After hours: {routing.afterHours}. Saved configuration. Not verified live.</p>
            <p className="ops-muted">Routing changes are not confirmed until verified on the phone system.</p>
          </section>
        ) : (
          <>
            <form className="ops-toolbar" method="get">
              <input type="hidden" name="tab" value={tab} />
              <input name="q" defaultValue={query.q || ""} placeholder={tab === "extensions" ? "Search name, email or extension" : "Search groups"} aria-label="Search" />
              <select name="status" defaultValue={query.status || "all"} aria-label="Status">
                <option value="all">All</option>
                <option value="created">On phone system</option>
                <option value="failed">Needs attention</option>
                <option value="waiting">Pending</option>
              </select>
              {tab === "extensions" ? <label className="ops-check"><input type="checkbox" name="removed" value="1" defaultChecked={query.removed === "1"} /> Show removed records</label> : null}
              <button className="btn btn-secondary" type="submit">Search</button>
            </form>
            <div className="ops-table-wrap">
              {tab === "extensions" ? (
                <table className="ops-table">
                  <thead><tr><th>Extension</th><th>Person</th><th>Email</th><th>Provisioning</th><th></th></tr></thead>
                  <tbody>
                    {people.length === 0 ? <tr><td colSpan={5}>No extensions match.</td></tr> : null}
                    {people.map((person) => {
                      const state = personState(person.status);
                      return (
                        <tr key={person.id} data-current={selectedPerson?.id === person.id ? "true" : undefined}>
                          <td>{person.number}</td>
                          <td>{person.first} {person.last}</td>
                          <td>{person.email}</td>
                          <td><span className={`ops-badge ${state.tone}`}>{state.label}</span></td>
                          <td><Link className="btn btn-secondary" href={href("extensions", `&ext=${person.id}&q=${encodeURIComponent(query.q || "")}&status=${query.status || "all"}${query.removed === "1" ? "&removed=1" : ""}`)}>View</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="ops-table">
                  <thead><tr><th>Group</th><th>Extension</th><th>Members</th><th>Provisioning</th><th></th></tr></thead>
                  <tbody>
                    {groups.length === 0 ? <tr><td colSpan={5}>No {tab === "queues" ? "queues" : "ring groups"} match.</td></tr> : null}
                    {groups.map((group) => {
                      const state = personState(group.status);
                      return (
                        <tr key={group.id} data-current={selectedGroup?.id === group.id ? "true" : undefined}>
                          <td><strong>{group.name}</strong></td>
                          <td>{group.number}</td>
                          <td>{group.members.length}</td>
                          <td><span className={`ops-badge ${state.tone}`}>{state.label}</span></td>
                          <td><Link className="btn btn-secondary" href={href(tab, `&group=${group.id}`)}>View</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="ops-foot">Group and queue numbers use the existing phone-system allocation rules.</p>
          </>
        )}
      </div>
      {selectedPerson && tab === "extensions" ? <PersonDrawer person={selectedPerson} company={companyId} live={live} /> : null}
      {selectedGroup && (tab === "groups" || tab === "queues") ? <GroupDrawer group={selectedGroup} company={companyId} companyName={company.name || company.email} live={live} /> : null}
    </div>
  );
}
