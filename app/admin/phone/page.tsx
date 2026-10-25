import { completeGroup, provisionPerson, retryGroup } from "../actions";
import { ExtensionPlanForm } from "@/components/admin/ExtensionPlanForm";
import { requirePermission } from "@/lib/access";
import { groupMembers, strategyLabel } from "@/lib/call-groups";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { readExtensionPlan } from "@/lib/extension-plan";
import { extensionCapacity, normalizePlans } from "@/lib/plan-features";
import type { Plan } from "@/lib/types";

type Row = { id: number; email: string; account_email: string; number: string; first_name: string; last_name: string; status: string; xapi_id: number; last_message: string };
type GroupRow = { id: number; email: string; kind: string; name: string; number: string; strategy: string; answers: number; status: string; xapi_id: number; last_message: string; task_status: string | null; members: string | null; department_name: string | null };

export default async function AdminPhonePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requirePermission("settings.phone");
  const params = await searchParams;
  const live = flagOn("pbx.live_provision");
  const plan = readExtensionPlan();
  const plans = normalizePlans(readDoc<Plan[]>("plans")).filter((item) => !item.custom);
  const planLine = plans.map((item) => `${item.name} includes ${extensionCapacity(item)}`).join(", ");
  const reserved = getDb().prepare(
    `SELECT u.email, d.number_from, d.number_to FROM pbx_departments d
     JOIN users u ON u.id = d.user_id
     WHERE d.number_from != '' AND d.number_to != ''
     ORDER BY CAST(d.number_from AS INTEGER)`,
  ).all() as { email: string; number_from: string; number_to: string }[];
  const rows = getDb().prepare(
    `SELECT e.id, e.email, u.email AS account_email, e.number, e.first_name, e.last_name, e.status, e.xapi_id, e.last_message
     FROM pbx_extensions e JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 100`,
  ).all() as Row[];
  const groups = getDb().prepare(
    `SELECT g.id, u.email, g.kind, g.name, g.number, g.strategy, g.answers, g.status, g.xapi_id, g.last_message, t.status AS task_status, t.members, t.department_name
     FROM call_groups g JOIN users u ON u.id = g.user_id
     LEFT JOIN call_group_tasks t ON t.group_id = g.id
     ORDER BY g.id DESC LIMIT 100`,
  ).all() as GroupRow[];
  return (
    <>
      <span className="eyebrow">Phone system</span>
      <h2>Extensions, ring groups, and queues</h2>
      <p>Each customer gets a department on 3CX. Daytime calls go to the ring group or queue they chose, once that group is on the phone system. Otherwise they go to the first extension. After hours they go to voicemail. If 3CX does not accept the group, build it on the server with the number and people below, point the department office-hours route at it, and mark it done.</p>
      <p>How many extensions a customer can add is set on that customer’s plan. {planLine}. The most any plan can include is 500. Change those under Plans. A customer cannot add more people than their plan includes.</p>
      <p>The message that said 3CX received 500 was a list of existing numbers, 500 records in one request. 3CX accepts 100 records per request, so that list is read 100 at a time. That 500 is not an extension number and it is not a plan limit.</p>
      {reserved.length ? <p>Ranges already given stay as they are: {reserved.map((row) => `${row.email} ${row.number_from}–${row.number_to}`).join(". ")}. A department already created on 3CX keeps its range. People already saved keep their numbers. The next customer with no range is reserved as many numbers as their plan includes, starting at {plan.start}.</p> : <p>No range has been given out yet. The next customer is reserved as many numbers as their plan includes, starting at {plan.start}. Numbers already on 3CX are skipped. People already saved keep their numbers.</p>}
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      <ExtensionPlanForm plan={plan} />
      <h3>Ring groups and call queues</h3>
      {groups.length === 0 ? <p>No groups yet.</p> : null}
      {groups.map((group) => {
        const people = group.members || groupMembers(group.id).map((member) => `${member.number} ${member.first_name} ${member.last_name}`).join(", ");
        return (
          <article key={group.id} className="feature-card" style={{ marginBottom: 16 }}>
            <h3>{group.kind === "queue" ? "Queue" : "Ring group"} {group.number} · {group.name}</h3>
            <p>{group.email} · {strategyLabel(group.kind, group.strategy)} · {group.answers ? "Answers daytime calls" : "Does not answer daytime calls"}</p>
            <p>{people || "No people"}{group.department_name ? ` · Department ${group.department_name}` : ""}</p>
            <p>{group.status === "created" ? "On the phone system" : group.status === "manual" ? "Marked done on the server" : group.status === "failed" ? "Needs attention" : "Waiting"}{group.xapi_id ? ` · ${group.xapi_id}` : ""}</p>
            {group.last_message ? <p>{group.last_message}</p> : null}
            {group.status !== "created" && group.status !== "manual" ? (
              <>
                <form action={retryGroup}>
                  <input type="hidden" name="id" value={group.id} />
                  <button className="btn btn-primary" type="submit">{live ? "Create on the phone system" : "Try again"}</button>
                </form>
                <form action={completeGroup} className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={group.id} />
                  <label>Note <input name="note" placeholder="Built on the 3CX server" /></label>
                  <button className="btn btn-secondary" type="submit">Mark done</button>
                </form>
              </>
            ) : null}
          </article>
        );
      })}
      <h3>Extensions</h3>
      {rows.length === 0 ? <p>No one has been added yet.</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="feature-card" style={{ marginBottom: 16 }}>
          <h3>Extension {row.number} · {row.first_name} {row.last_name}</h3>
          <p>{row.email}{row.account_email && row.account_email.toLowerCase() !== row.email.toLowerCase() ? ` · Account ${row.account_email}` : ""} · {row.status === "created" ? "On the phone system" : row.status === "failed" ? "Needs attention" : "Waiting"}{row.xapi_id ? ` · ${row.xapi_id}` : ""}</p>
          {row.last_message ? <p>{row.last_message}</p> : null}
          {row.status !== "created" ? (
            <form action={provisionPerson}>
              <input type="hidden" name="id" value={row.id} />
              <button className="btn btn-primary" type="submit" disabled={!live}>{live ? "Create on the phone system" : "Creating people is turned off"}</button>
            </form>
          ) : null}
        </article>
      ))}
    </>
  );
}
