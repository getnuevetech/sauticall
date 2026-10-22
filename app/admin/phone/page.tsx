import { completeGroup, provisionPerson, retryGroup } from "../actions";
import { requirePermission } from "@/lib/access";
import { groupMembers, strategyLabel } from "@/lib/call-groups";
import { flagOn, getDb } from "@/lib/db";

type Row = { id: number; email: string; number: string; first_name: string; last_name: string; status: string; xapi_id: number; last_message: string };
type GroupRow = { id: number; email: string; kind: string; name: string; number: string; strategy: string; answers: number; status: string; xapi_id: number; last_message: string; task_status: string | null; members: string | null; department_name: string | null };

export default async function AdminPhonePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("settings.phone");
  const params = await searchParams;
  const live = flagOn("pbx.live_provision");
  const rows = getDb().prepare(
    `SELECT e.id, u.email, e.number, e.first_name, e.last_name, e.status, e.xapi_id, e.last_message
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
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
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
          <p>{row.email} · {row.status === "created" ? "On the phone system" : row.status === "failed" ? "Needs attention" : "Waiting"}{row.xapi_id ? ` · ${row.xapi_id}` : ""}</p>
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
