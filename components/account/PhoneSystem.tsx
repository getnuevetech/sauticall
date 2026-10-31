"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addPerson, removePerson, saveDepartmentName, savePerson, savePhoneHours } from "@/app/account/actions";
import { chooseDaytimeGroup, createQueue, createRingGroup, deleteCallGroup } from "@/app/account/desk-actions";
import { AppPassword } from "./AppPassword";
import { clockLabel, extensionSetup, personInitials } from "@/lib/account-display";
import { Icon } from "@/components/Icon";

type Person = { id: number; number: string; first: string; last: string; email: string; status: string; welcome: string; aiRole: string; aiName: string };
type AiChoice = { code: string; label: string };

function AiExtensionFields({ choices, role, name }: { choices: AiChoice[]; role: string; name: string }) {
  if (choices.length === 0) return <p>No AI system is included on this plan. An administrator adds each AI system to a plan.</p>;
  return (
    <>
      <label>AI system
        <select name="ai_role" defaultValue={role}>
          <option value="">Ordinary extension</option>
          {choices.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      <label>AI extension name <input name="ai_name" defaultValue={name} placeholder="Front desk" /></label>
      <p>Choose an AI system to make this extension an AI extension for this account. Live calls stay off until the phone-system connection is verified.</p>
    </>
  );
}
type Group = { id: number; kind: string; name: string; number: string; strategy: string; answers: boolean; status: string; people: string };
type Choice = { value: string; label: string };

export function PhoneSystem({
  initialTab,
  company,
  rules,
  planName,
  seats,
  limit,
  hasPlan,
  bought,
  connected,
  connectionStatus = "",
  hoursOpen,
  hoursClose,
  hoursNote,
  people,
  aiChoices,
  groups,
  ringChoices,
  queueChoices,
  allowHours,
  allowRings,
  allowQueues,
  needsCode,
  hasAuthenticator,
  notice,
  noticeError = false,
}: {
  initialTab: string;
  company: string;
  rules: string;
  planName: string;
  seats: number;
  limit: number;
  hasPlan: boolean;
  bought: boolean;
  connected: boolean;
  connectionStatus?: string;
  hoursOpen: string;
  hoursClose: string;
  hoursNote: string;
  people: Person[];
  aiChoices: AiChoice[];
  groups: Group[];
  ringChoices: Choice[];
  queueChoices: Choice[];
  allowHours: boolean;
  allowRings: boolean;
  allowQueues: boolean;
  needsCode: boolean;
  hasAuthenticator: boolean;
  notice: string;
  noticeError?: boolean;
}) {
  const tabs = ["users", "routing", "rings", "queues", "devices", "settings"];
  const [tab, setTab] = useState(tabs.includes(initialTab) ? initialTab : "users");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(people.find((person) => person.status !== "removed")?.id || people[0]?.id || null);
  const [panel, setPanel] = useState<"details" | "devices" | "app">("details");
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [menuId, setMenuId] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const active = people.filter((person) => person.status !== "removed");
  const selected = people.find((person) => person.id === selectedId) || null;
  const daytime = groups.find((group) => group.answers);
  const firstPerson = active[0];
  const rings = groups.filter((group) => group.kind === "ring");
  const queues = groups.filter((group) => group.kind === "queue");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      const setup = extensionSetup(person.status);
      if (filter === "ok" && setup.tone !== "ok") return false;
      if (filter === "warn" && setup.tone !== "warn") return false;
      if (filter === "wait" && setup.tone !== "wait") return false;
      if (filter === "removed" && person.status !== "removed") return false;
      if (filter === "all" && person.status === "removed") return false;
      if (!needle) return true;
      return `${person.first} ${person.last} ${person.email} ${person.number}`.toLowerCase().includes(needle);
    });
  }, [people, query, filter]);

  return (
    <div className="pbx-page">
      <header className="num-head">
        <div>
          <h1>Phone system</h1>
          <p>Manage your team, extensions, and how calls reach your business.</p>
        </div>
      </header>
      {notice ? <p className={noticeError ? "form-feedback form-error" : "form-feedback"} role={noticeError ? "alert" : "status"}>{notice}</p> : null}
      {!hasPlan ? (
        <section className="num-card"><p>Choose a plan before people can be added. <Link href="/account/billing/plan">View plans</Link></p></section>
      ) : (
        <>
          <section className="pbx-company">
            {editingName ? (
              <form action={saveDepartmentName} className="pbx-name-form">
                <input name="company_name" defaultValue={company} maxLength={50} required placeholder="Company name" />
                <button className="ws-btn primary" type="submit">Save</button>
                <button className="ws-btn ghost" type="button" onClick={() => setEditingName(false)}>Cancel</button>
              </form>
            ) : (
              <button type="button" className="pbx-name" onClick={() => setEditingName(true)}>
                <span className="num-ico"><Icon name="server" size={16} /></span>
                <strong>{company || "Add a company name"}</strong>
                <Icon name="settings" size={14} />
              </button>
            )}
            <span>{planName} · {active.length} of {seats} {seats === 1 ? "seat" : "seats"} used</span>
            <Link href="/account/billing/plan">Manage plan</Link>
          </section>
          <div className="num-tabs">
            <button type="button" className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users & extensions</button>
            <button type="button" className={tab === "routing" ? "active" : ""} onClick={() => setTab("routing")}>Call routing & hours</button>
            <button type="button" className={tab === "rings" ? "active" : ""} onClick={() => setTab("rings")}>Ring groups</button>
            <button type="button" className={tab === "queues" ? "active" : ""} onClick={() => setTab("queues")}>{allowQueues ? "Call queues" : <><Icon name="lock" size={14} /> Call queues</>}</button>
            <button type="button" className={tab === "devices" ? "active" : ""} onClick={() => setTab("devices")}>Devices</button>
            <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>System settings</button>
          </div>

          {tab === "users" ? (
            <>
              {!connected ? (
                <div className="num-alert">
                  <span className="num-ico"><Icon name="phone" size={16} /></span>
                  <div>
                    <strong>{bought ? (connectionStatus || "Your number is bought. Connecting it for calls is still being finished.") : "Connect a business number to enable external calling."}</strong>
                    <p>{bought ? "Inbound and outbound calling starts after that connection is finished." : "People can be added now. Outside calls start after a number is bought."}</p>
                  </div>
                  {bought ? null : <Link className="ws-btn ghost num-outline" href="/account/numbers">Get a number</Link>}
                </div>
              ) : null}
              <div className="pbx-board">
                <section className="num-card pbx-users">
                  <div className="num-results-head">
                    <div>
                      <h2>Users & extensions</h2>
                      <p>{active.length >= limit ? "Your plan is at capacity. Upgrade to add more people." : company ? `People are added to ${company}.` : "Save the company name before adding a person."}</p>
                    </div>
                    <button className="ws-btn ghost num-outline" type="button" disabled={!company || active.length >= limit} onClick={() => setAdding(true)}>+ Add user</button>
                  </div>
                  {adding && company && active.length < limit ? (
                    <form className="pbx-add" action={addPerson}>
                      <label>First name <input name="first_name" required /></label>
                      <label>Last name <input name="last_name" required /></label>
                      <label>Email <input name="email" type="email" required /></label>
                      <AiExtensionFields choices={aiChoices} role="" name="" />
                      <button className="ws-btn primary" type="submit">Add person</button>
                      <button className="ws-btn ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
                    </form>
                  ) : null}
                  <div className="pbx-filters">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or extension" />
                    <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Setup status">
                      <option value="all">All setup statuses</option>
                      <option value="ok">Provisioned</option>
                      <option value="warn">Needs attention</option>
                      <option value="wait">Waiting</option>
                      <option value="removed">Removed</option>
                    </select>
                  </div>
                  <table className="num-table">
                    <thead><tr><th>User</th><th>Extension</th><th>Setup status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {shown.length === 0 ? <tr><td colSpan={4}>No people match that search.</td></tr> : shown.map((person) => {
                        const setup = extensionSetup(person.status);
                        return (
                          <tr key={person.id} className={selected?.id === person.id ? "selected" : ""}>
                            <td>
                              <span className="pbx-user"><span className="ws-avatar">{personInitials(`${person.first} ${person.last}`)}</span><span><strong>{person.first} {person.last}</strong><small>{person.aiName ? `${person.aiName} · ${person.email}` : person.email}</small></span></span>
                            </td>
                            <td>{person.number}</td>
                            <td><span className={`pbx-status ${setup.tone}`}>{setup.label}</span></td>
                            <td className="pbx-actions">
                              <button type="button" className="num-link" onClick={() => { setSelectedId(person.id); setPanel("details"); setEditingPerson(false); setMoreOpen(false); }}>{setup.tone === "ok" ? "Manage" : "View details"}</button>
                              <span className="pbx-menu">
                                <button type="button" aria-label="More actions" onClick={() => setMenuId(menuId === person.id ? 0 : person.id)}>•••</button>
                                {menuId === person.id && person.status !== "removed" ? (
                                  <form action={removePerson}>
                                    <input type="hidden" name="id" value={person.id} />
                                    <button type="submit">Remove from the phone system</button>
                                  </form>
                                ) : null}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p>Provisioned means the extension is on the phone system. A desk phone is requested through support.</p>
                </section>
                <aside className="pbx-side">
                {selected ? (
                  <section className="num-card pbx-panel">
                    <div className="num-modal-head">
                      <div>
                        <h2>Extension {selected.number}</h2>
                        <p>{selected.first} {selected.last}</p>
                      </div>
                      <button type="button" aria-label="Close" onClick={() => setSelectedId(null)}>×</button>
                    </div>
                    <div className="pbx-panel-tabs">
                      <button type="button" className={panel === "details" ? "active" : ""} onClick={() => setPanel("details")}>Details</button>
                      <button type="button" className={panel === "devices" ? "active" : ""} onClick={() => setPanel("devices")}>Devices</button>
                      <button type="button" className={panel === "app" ? "active" : ""} onClick={() => setPanel("app")}>App access</button>
                    </div>
                    {panel === "details" ? (
                      <>
                        {editingPerson && selected.status !== "removed" ? (
                          <form action={savePerson} className="pbx-edit">
                            <input type="hidden" name="id" value={selected.id} />
                            <label>First name <input name="first_name" defaultValue={selected.first} required /></label>
                            <label>Last name <input name="last_name" defaultValue={selected.last} required /></label>
                            <label>Email <input name="email" type="email" defaultValue={selected.email} required /></label>
                            <AiExtensionFields choices={aiChoices} role={selected.aiRole} name={selected.aiName} />
                            <button className="ws-btn primary" type="submit">Save user</button>
                            <button className="ws-btn ghost" type="button" onClick={() => setEditingPerson(false)}>Cancel</button>
                          </form>
                        ) : (
                          <>
                            <p><span>Name</span><strong>{selected.first} {selected.last}</strong></p>
                            <p><span>Email</span><strong>{selected.email}</strong></p>
                            <p><span>Department</span><strong>{company || "Not set"}</strong></p>
                            <p><span>Setup status</span><strong className={`pbx-status ${extensionSetup(selected.status).tone}`}>{extensionSetup(selected.status).label}</strong></p>
                            <p><span>Device status</span><strong>Not available</strong></p>
                            <p><span>AI extension</span><strong>{selected.aiRole ? `${selected.aiName || "Named on the AI page"} · ${aiChoices.find((item) => item.code === selected.aiRole)?.label || selected.aiRole}` : "Ordinary extension"}</strong></p>
                          </>
                        )}
                        {selected.welcome ? <p className={selected.status === "failed" ? "form-error" : undefined} role={selected.status === "failed" ? "alert" : undefined}>{selected.welcome}</p> : null}
                        {!connected ? <div className="pbx-callout"><Icon name="phone" size={16} /> External calling requires an active business number.</div> : null}
                        {selected.status !== "removed" ? (
                          <div className="pbx-panel-actions">
                            <button className="ws-btn ghost" type="button" onClick={() => setEditingPerson(true)}>Edit user</button>
                            <button className="ws-btn primary" type="button" onClick={() => setPanel("app")}>Open app setup</button>
                          </div>
                        ) : <p>This person was removed. The name, email, and extension stay in the record.</p>}
                        {selected.status !== "removed" ? (
                          <div className="pbx-menu pbx-more">
                            <button type="button" onClick={() => setMoreOpen(!moreOpen)}>More actions</button>
                            {moreOpen ? (
                              <form action={removePerson}>
                                <input type="hidden" name="id" value={selected.id} />
                                <button type="submit">Remove from the phone system</button>
                              </form>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {panel === "devices" ? <p>No desk phone is listed for this person. Contact support if you want a desk phone.</p> : null}
                    {panel === "app" ? (
                      selected.status === "created" ? (
                        <>
                          <p>The app password stays hidden. {needsCode ? "Enter the authenticator code to reveal it." : "Reveal it only when you are ready to sign in to the phone app."}</p>
                          {needsCode && !hasAuthenticator ? <p><Link href="/account/security?tab=security">Set up your authenticator to reveal the app password.</Link></p> : <AppPassword extensionId={selected.id} needsCode={needsCode} />}
                        </>
                      ) : <p>App access is available after the extension is on the phone system.</p>
                    ) : null}
                  </section>
                ) : <section className="num-card"><p>Select a person to see the extension.</p></section>}
                  <section className="num-card">
                    <div className="num-results-head"><h2>Ring groups</h2>{allowRings ? <button type="button" className="ws-btn ghost num-outline" onClick={() => setTab("rings")}>Create ring group</button> : null}</div>
                    {rings.length === 0 ? <p>No ring groups yet</p> : rings.map((group) => <p key={group.id}><strong>{group.name}</strong> · Ext. {group.number}</p>)}
                    <p>Let multiple team members answer incoming calls.</p>
                  </section>
                  <section className="num-card">
                    <div className="num-results-head"><h2>Call queues</h2>{allowQueues ? <button type="button" className="num-link" onClick={() => setTab("queues")}>Manage queues</button> : <Link href="/account/billing/plan">Compare plans</Link>}</div>
                    {allowQueues ? (queues.length === 0 ? <p>No call queues yet</p> : queues.map((group) => <p key={group.id}><strong>{group.name}</strong> · Ext. {group.number}</p>)) : <p>Available on Team</p>}
                    <p>Distribute calls to a queue of team members.</p>
                  </section>
                </aside>
                <section className="num-card pbx-hours-card">
                  <div className="num-results-head"><h2>Business hours</h2>{allowHours ? <button type="button" className="num-link" onClick={() => setTab("routing")}>Edit hours</button> : null}</div>
                  {allowHours ? <p className="pbx-hours-time">{hoursOpen ? `${clockLabel(hoursOpen)} – ${clockLabel(hoursClose)}` : "Hours are not saved yet."}</p> : <p>Business hours are not included on {planName}.</p>}
                  <p>Central Time</p>
                </section>
                <section className="num-card pbx-route-card">
                  <div className="num-results-head"><h2>Call routing</h2><button type="button" className="num-link" onClick={() => setTab("routing")}>Edit routing</button></div>
                  <p>During hours <span>→</span> {daytime ? daytime.name : firstPerson ? `Extension ${firstPerson.number}` : "The first person you add"}</p>
                  <p>After hours <span>→</span> Voicemail</p>
                </section>
              </div>
            </>
          ) : null}

          {tab === "routing" ? (
            <section className="num-card">
              <h2>Call routing & hours</h2>
              {allowHours ? (
                <form action={savePhoneHours} className="pbx-hours">
                  <label>Opens <input name="open_time" type="time" defaultValue={hoursOpen || "09:00"} required /></label>
                  <label>Closes <input name="close_time" type="time" defaultValue={hoursClose || "17:00"} required /></label>
                  <button className="ws-btn primary" type="submit">Save hours</button>
                </form>
              ) : <p>Business hours are not included on {planName}.</p>}
              {hoursNote ? <p>{hoursNote}</p> : null}
              <p>During open hours, calls go to {daytime ? daytime.name : firstPerson ? `extension ${firstPerson.number}` : "the first person you add"}.</p>
              <p>After closing, calls go to voicemail.</p>
            </section>
          ) : null}

          {tab === "rings" ? (
            <section className="num-card">
              <h2>Ring groups</h2>
              {!allowRings ? <p>Ring groups are not included on {planName}.</p> : null}
              {allowRings && active.length > 0 ? (
                <form action={createRingGroup} className="pbx-group">
                  <label>Name <input name="name" required placeholder="Front desk" /></label>
                  <label>How it rings
                    <select name="strategy" defaultValue="ring_all">{ringChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
                  </label>
                  <fieldset>
                    <legend>People</legend>
                    {active.map((person) => <label key={person.id}><input type="checkbox" name="extension_id" value={person.id} /> {person.first} {person.last} · {person.number}</label>)}
                  </fieldset>
                  <button className="ws-btn primary" type="submit">Create ring group</button>
                </form>
              ) : null}
              <GroupList groups={groups.filter((group) => group.kind === "ring")} empty="No ring groups yet." />
            </section>
          ) : null}

          {tab === "queues" ? (
            <section className="num-card">
              <h2>Call queues</h2>
              {!allowQueues ? <p>Call queues are included on the Team plan. <Link href="/account/billing/plan">Compare plans</Link></p> : null}
              {allowQueues && active.length > 0 ? (
                <form action={createQueue} className="pbx-group">
                  <label>Name <input name="name" required placeholder="Support" /></label>
                  <label>How it rings
                    <select name="strategy" defaultValue="hunt">{queueChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
                  </label>
                  <fieldset>
                    <legend>People</legend>
                    {active.map((person) => <label key={person.id}><input type="checkbox" name="extension_id" value={person.id} /> {person.first} {person.last} · {person.number}</label>)}
                  </fieldset>
                  <button className="ws-btn primary" type="submit">Create call queue</button>
                </form>
              ) : null}
              <GroupList groups={groups.filter((group) => group.kind === "queue")} empty={allowQueues ? "No call queues yet." : ""} />
            </section>
          ) : null}

          {tab === "devices" ? (
            <section className="num-card">
              <h2>Devices</h2>
              <p>Desk phones are set up with SautiCall support. No devices are listed on this account yet.</p>
              <Link href="/account/tickets/new">Contact support</Link>
            </section>
          ) : null}

          {tab === "settings" ? (
            <section className="num-card set-form">
              <h2>System settings</h2>
              <form action={saveDepartmentName}>
                <label>Company name <input name="company_name" defaultValue={company} maxLength={50} required /></label>
                <p>{rules}</p>
                <button className="ws-btn primary" type="submit">Save company name</button>
              </form>
              <p>{planName} includes {limit} {limit === 1 ? "person" : "people"}.</p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function GroupList({ groups, empty }: { groups: Group[]; empty: string }) {
  if (groups.length === 0) return empty ? <p>{empty}</p> : null;
  return (
    <div className="pbx-groups">
      {groups.map((group) => (
        <article key={group.id}>
          <strong>{group.name}</strong>
          <p>Ext. {group.number} · {group.strategy} · {group.people || "No people"} · {group.status}</p>
          <div>
            <form action={chooseDaytimeGroup}>
              <input type="hidden" name="group_id" value={group.answers ? 0 : group.id} />
              <button className="ws-btn ghost" type="submit">{group.answers ? "Stop using for daytime calls" : "Use for daytime calls"}</button>
            </form>
            <form action={deleteCallGroup}>
              <input type="hidden" name="group_id" value={group.id} />
              <button className="ws-btn ghost" type="submit">Remove</button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
