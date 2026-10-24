import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { addPerson, savePhoneHours } from "../actions";
import { chooseDaytimeGroup, createQueue, createRingGroup, deleteCallGroup } from "../desk-actions";
import { guardAccount } from "@/lib/guard";
import { QUEUE_STRATEGIES, RING_STRATEGIES, groupMembers, strategyLabel, type CallGroup } from "@/lib/call-groups";
import { getDb } from "@/lib/db";
import { extensionCapacity, paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { customerMessage } from "@/lib/customer-message";
import { loadSite } from "@/lib/site";

type Extension = { id: number; number: string; first_name: string; last_name: string; email: string; status: string; access_password: string; last_message: string };

function setupStatus(status: string) {
  if (status === "created" || status === "manual") return "Ready";
  if (status === "failed") return "We could not finish this yet. The team has the details.";
  return "Waiting to be set up.";
}

function PeopleFields({ rows, label }: { rows: Extension[]; label: string }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="check-list">
        {rows.map((row) => (
          <label key={row.id}><input type="checkbox" name="extension_id" value={row.id} /> {row.first_name} {row.last_name} · {row.number}</label>
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
  const rows = getDb().prepare("SELECT id, number, first_name, last_name, email, status, access_password, last_message FROM pbx_extensions WHERE user_id = ? ORDER BY id").all(user.id) as Extension[];
  const hours = getDb().prepare("SELECT open_time, close_time, last_message FROM pbx_departments WHERE user_id = ?").get(user.id) as { open_time: string; close_time: string; last_message: string } | undefined;
  const groups = getDb().prepare("SELECT * FROM call_groups WHERE user_id = ? ORDER BY kind, id").all(user.id) as CallGroup[];
  const saved = params.saved === "group" ? text("phoneGroupSaved") : params.saved === "hours" ? text("phoneHoursSaved") : params.saved ? text("phoneSaved") : "";
  return (
    <Frame pathname="/account/phone">
      <main>
        <AccountHero eyebrow="PHONE SYSTEM" title={text("phoneTitle")} body={text("phoneBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/phone" />
            {saved ? <p className="form-feedback">{saved}{params.note ? ` ${customerMessage(params.note, "")}` : ""}</p> : null}
            {params.error ? <p className="form-feedback">{customerMessage(params.error, "Something went wrong. Please try again, or contact support.")}</p> : null}
            {!plan ? <div className="contact-form"><p>{text("phoneClosed")}</p></div> : (
              <>
                <p>{plan.name} includes {limit} {limit === 1 ? "person" : "people"}. {rows.length} added.</p>
                {!planAllows(plan, "ring_groups") ? <p>Ring groups are not included on {plan.name}.</p> : null}
                {!planAllows(plan, "queues") ? <p>Call queues are not included on {plan.name}.</p> : null}
                {!planAllows(plan, "ai") ? <p>The AI receptionist is not included on {plan.name}.</p> : null}
                {rows.length < limit ? (
                  <form className="contact-form" action={addPerson}>
                    <div className="form-grid">
                      <label>{text("phoneFirst")} <input name="first_name" required /></label>
                      <label>{text("phoneLast")} <input name="last_name" required /></label>
                    </div>
                    <label>{text("phoneEmail")} <input name="email" type="email" required /></label>
                    <button className="btn btn-primary" type="submit">{text("phoneAdd")}</button>
                  </form>
                ) : <p>{text("phoneLimit")}</p>}
                {planAllows(plan, "business_hours") ? <form className="contact-form" action={savePhoneHours} style={{ marginTop: 18 }}>
                  <h3>{text("phoneHours")}</h3>
                  <div className="form-grid">
                    <label>{text("phoneOpen")} <input name="open_time" type="time" defaultValue={hours?.open_time || "09:00"} required /></label>
                    <label>{text("phoneClose")} <input name="close_time" type="time" defaultValue={hours?.close_time || "17:00"} required /></label>
                  </div>
                  <button className="btn btn-secondary" type="submit">{text("phoneRoute")}</button>
                  {hours?.last_message && customerMessage(hours.last_message, "") ? <p>{customerMessage(hours.last_message, "")}</p> : null}
                </form> : null}
                {rows.length ? (
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
                      <PeopleFields rows={rows} label={text("phoneMembers")} />
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
                      <PeopleFields rows={rows} label={text("phoneMembers")} />
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
                  <h3>Extension {row.number} · {row.first_name} {row.last_name}</h3>
                  <p>{row.email}</p>
                  <p>{setupStatus(row.status)}</p>
                  {row.status === "created" ? <p>App password: {row.access_password}</p> : null}
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
