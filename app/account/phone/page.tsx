import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { addPerson, removePerson, saveDepartmentName, savePhoneHours } from "../actions";
import { chooseDaytimeGroup, createQueue, createRingGroup, deleteCallGroup } from "../desk-actions";
import { guardAccount } from "@/lib/guard";
import { QUEUE_STRATEGIES, RING_STRATEGIES, groupMembers, strategyLabel, type CallGroup } from "@/lib/call-groups";
import { getDb } from "@/lib/db";
import { extensionCapacity, paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { AppPassword } from "@/components/account/AppPassword";
import { customerMessage } from "@/lib/customer-message";
import { accountNeedsMfa } from "@/lib/mfa";
import { DEPARTMENT_NAME_RULES, acceptedDepartmentName } from "@/lib/pbx-user";
import { loadSite } from "@/lib/site";

type Extension = { id: number; number: string; former_number: string; first_name: string; last_name: string; email: string; status: string; welcome_note: string };

function extensionNumber(row: Extension) {
  return row.status === "removed" && row.former_number ? row.former_number : row.number;
}

function setupStatus(status: string) {
  if (status === "removed") return "Removed. The name, email, and extension stay in the record.";
  if (status === "created" || status === "manual") return "Ready";
  if (status === "failed") return "We could not finish this yet. The team has the details.";
  return "Waiting to be set up.";
}

function PeopleFields({ rows, label }: { rows: Extension[]; label: string }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="check-list">
        {rows.filter((row) => row.status !== "removed").map((row) => (
          <label key={row.id}><input type="checkbox" name="extension_id" value={row.id} /> {row.first_name} {row.last_name} · {extensionNumber(row)}</label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function PhonePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; note?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const plan = paidPlan(user.id);
  const limit = plan ? extensionCapacity(plan) : 0;
  const rows = getDb().prepare("SELECT id, number, former_number, first_name, last_name, email, status, welcome_note FROM pbx_extensions WHERE user_id = ? ORDER BY id").all(user.id) as Extension[];
  const needsCode = Boolean(user.mfa_secret) || accountNeedsMfa(user);
  const activeRows = rows.filter((row) => row.status !== "removed");
  const hours = getDb().prepare("SELECT name, open_time, close_time, last_message FROM pbx_departments WHERE user_id = ?").get(user.id) as { name: string; open_time: string; close_time: string; last_message: string } | undefined;
  const companyName = acceptedDepartmentName(hours?.name || "");
  const lines = getDb().prepare("SELECT status FROM phone_lines WHERE user_id = ?").all(user.id) as { status: string }[];
  const connected = lines.some((line) => line.status === "trunk_live" || line.status === "trunk_done");
  const bought = lines.some((line) => line.status !== "not_on_carrier");
  const groups = getDb().prepare("SELECT * FROM call_groups WHERE user_id = ? ORDER BY kind, id").all(user.id) as CallGroup[];
  const saved = params.saved === "department" ? "Company name saved. People are added to this department." : params.saved === "group" ? text("phoneGroupSaved") : params.saved === "hours" ? text("phoneHoursSaved") : params.saved === "removed" ? "This person was removed. Their name, email, and extension stay in the record." : params.saved ? text("phoneSaved") : "";
  return (
    <Frame pathname="/account/phone">
      <main>
        <AccountHero eyebrow="PHONE SYSTEM" title={text("phoneTitle")} body={text("phoneBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/phone" />
            {saved ? <p className="form-feedback">{saved}{params.note ? ` ${customerMessage(params.note, "")}` : ""}</p> : null}
            {params.error ? <p className="form-feedback">{customerMessage(params.error, "Something went wrong. Please try again, or contact support.")}</p> : null}
            {plan && !connected ? <p className="form-feedback">{bought ? "Your number is bought. Connecting it for calls is still being finished." : "Buy a business number before these extensions can make or receive calls."} {bought ? null : <a href="/account/numbers">Buy a number</a>}</p> : null}
            {!plan ? <div className="contact-form"><p>{text("phoneClosed")}</p></div> : (
              <>
                <p>{plan.name} includes {limit} {limit === 1 ? "person" : "people"}. {activeRows.length} added.</p>
                <form className="contact-form" action={saveDepartmentName}>
                  <h3>Company name</h3>
                  <p>This name is the department. People are added to this department.</p>
                  <p>{DEPARTMENT_NAME_RULES}</p>
                  <label>Company name <input name="company_name" defaultValue={companyName} maxLength={50} required placeholder="Kwik Tech" /></label>
                  <button className="btn btn-primary" type="submit">Save company name</button>
                  {companyName ? <p>Department: {companyName}</p> : <p>Save the company name before adding a person.</p>}
                </form>
                {!planAllows(plan, "ring_groups") ? <p>Ring groups are not included on {plan.name}.</p> : null}
                {!planAllows(plan, "queues") ? <p>Call queues are not included on {plan.name}.</p> : null}
                {!planAllows(plan, "ai") ? <p>The AI receptionist is not included on {plan.name}.</p> : null}
                {companyName && activeRows.length < limit ? (
                  <form className="contact-form" action={addPerson}>
                    <div className="form-grid">
                      <label>{text("phoneFirst")} <input name="first_name" required /></label>
                      <label>{text("phoneLast")} <input name="last_name" required /></label>
                    </div>
                    <label>{text("phoneEmail")} <input name="email" type="email" required /></label>
                    <p>This person is added to {companyName}.</p>
                    <button className="btn btn-primary" type="submit">{text("phoneAdd")}</button>
                  </form>
                ) : null}
                {companyName && activeRows.length >= limit ? <p>{text("phoneLimit")}</p> : null}
                {planAllows(plan, "business_hours") ? <form className="contact-form" action={savePhoneHours} style={{ marginTop: 18 }}>
                  <h3>{text("phoneHours")}</h3>
                  <div className="form-grid">
                    <label>{text("phoneOpen")} <input name="open_time" type="time" defaultValue={hours?.open_time || "09:00"} required /></label>
                    <label>{text("phoneClose")} <input name="close_time" type="time" defaultValue={hours?.close_time || "17:00"} required /></label>
                  </div>
                  <button className="btn btn-secondary" type="submit">{text("phoneRoute")}</button>
                  {hours?.last_message && customerMessage(hours.last_message, "") ? <p>{customerMessage(hours.last_message, "")}</p> : null}
                </form> : null}
                {activeRows.length ? (
                  <>
                    {planAllows(plan, "ring_groups") ? <form className="contact-form" action={createRingGroup} style={{ marginTop: 18 }}>
                      <h3>{text("phoneRing")}</h3>
                      <p>{text("phoneRingBody")}</p>
                      <label>{text("phoneGroupName")} <input name="name" required placeholder="Front desk" /></label>
                      <label>{text("phoneStrategy")}
                        <select name="strategy" defaultValue="ring_all">
                          {RING_STRATEGIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <PeopleFields rows={activeRows} label={text("phoneMembers")} />
                      <button className="btn btn-primary" type="submit">{text("phoneCreateRing")}</button>
                    </form> : null}
                    {planAllows(plan, "queues") ? <form className="contact-form" action={createQueue} style={{ marginTop: 18 }}>
                      <h3>{text("phoneQueue")}</h3>
                      <p>{text("phoneQueueBody")}</p>
                      <label>{text("phoneGroupName")} <input name="name" required placeholder="Support" /></label>
                      <label>{text("phoneStrategy")}
                        <select name="strategy" defaultValue="hunt">
                          {QUEUE_STRATEGIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <PeopleFields rows={activeRows} label={text("phoneMembers")} />
                      <button className="btn btn-primary" type="submit">{text("phoneCreateQueue")}</button>
                    </form> : null}
                  </>
                ) : null}
              </>
            )}
            <div className="faq-list" style={{ marginTop: 28 }}>
              {rows.length === 0 ? <p>{text("phoneEmpty")}</p> : null}
              {rows.map((row) => (
                <article key={row.id} className="feature-card" style={{ marginBottom: 12 }}>
                  <h3>Extension {extensionNumber(row)} · {row.first_name} {row.last_name}</h3>
                  <p>{row.email}</p>
                  <p>{setupStatus(row.status)}</p>
                  {row.welcome_note ? <p>{row.welcome_note}</p> : null}
                  {row.status === "created" ? (
                    needsCode && !user.mfa_secret ? <p><a href="/account/security">Set up your authenticator to reveal the app password.</a></p> : <AppPassword extensionId={row.id} needsCode={needsCode} />
                  ) : null}
                  {row.status !== "removed" ? (
                    <form action={removePerson}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className="btn btn-secondary" type="submit">{text("phoneRemove")}</button>
                    </form>
                  ) : null}
                </article>
              ))}
              {groups.length === 0 && plan ? <p>{text("phoneGroupEmpty")}</p> : null}
              {groups.map((group) => {
                const people = groupMembers(group.id);
                return (
                  <article key={group.id} className="feature-card" style={{ marginBottom: 12 }}>
                    <h3>{group.kind === "queue" ? text("phoneQueue") : text("phoneRing")} {group.number} · {group.name}</h3>
                    <p>{strategyLabel(group.kind, group.strategy)} · {people.map((person) => person.first_name).join(", ") || "No people"}</p>
                    <p>{group.answers ? "Daytime destination" : "Not the daytime destination"} · {setupStatus(group.status)}</p>
                    <div className="cta-pair">
                      {group.answers ? (
                        <form action={chooseDaytimeGroup}><input type="hidden" name="group_id" value="0" /><button className="btn btn-secondary" type="submit">{text("phoneAnswerClear")}</button></form>
                      ) : (
                        <form action={chooseDaytimeGroup}><input type="hidden" name="group_id" value={group.id} /><button className="btn btn-secondary" type="submit">{text("phoneAnswer")}</button></form>
                      )}
                      <form action={deleteCallGroup}><input type="hidden" name="group_id" value={group.id} /><button className="btn btn-secondary" type="submit">{text("phoneRemove")}</button></form>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
