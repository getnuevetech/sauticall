import Link from "next/link";
import { TestMailSubmit } from "@/components/admin/TestMailSubmit";
import { CopyText, InboundSecret, MailPassword } from "@/components/admin/MailBits";
import { saveOutboundMail, saveRoutingGroup, saveRoutingMembers, saveRoutingTopic, sendTestMail, tryInboundMail } from "../../desk-actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";
import { mailSettings } from "@/lib/tickets";

const TABS = [
  { id: "groups", label: "Groups" },
  { id: "topics", label: "Topics" },
  { id: "inbound", label: "Inbound email" },
  { id: "outgoing", label: "Outgoing email" },
  { id: "diagnostics", label: "Diagnostics" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default async function TicketSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; topic?: string; group?: string; error?: string; saved?: string; sent?: string; notice?: string; test?: string; to?: string }> }) {
  await requirePermission("tickets.manage");
  const params = await searchParams;
  const tab: Tab = TABS.some((item) => item.id === params.tab) ? params.tab as Tab : "topics";
  const groups = getDb().prepare("SELECT id, name, description FROM ticket_groups ORDER BY name").all() as { id: number; name: string; description: string }[];
  const topics = getDb().prepare("SELECT id, name, group_id, enabled FROM ticket_topics ORDER BY name").all() as { id: number; name: string; group_id: number; enabled: number }[];
  const staff = getDb().prepare("SELECT id, name, email, role FROM users WHERE role IN ('staff', 'super_admin') ORDER BY name").all() as { id: number; name: string; email: string; role: string }[];
  const members = getDb().prepare("SELECT group_id, user_id FROM ticket_group_members").all() as { group_id: number; user_id: number }[];
  const mail = mailSettings();
  const origin = process.env.SAUTICALL_PUBLIC_ORIGIN || "https://your-site";
  const endpoint = `${origin}/api/tickets/inbound`;
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const creatingTopic = params.topic === "new";
  const topic = creatingTopic ? undefined : topics.find((item) => String(item.id) === params.topic) || (tab === "topics" ? topics[0] : undefined);
  const selectedGroup = groups.find((group) => String(group.id) === params.group) || groups[0];
  const lastResult = params.sent ? (params.notice || `Sent to ${params.to || "that address"}. The mail server accepted it.`) : params.test || "";
  return (
    <div>
      <p className="ops-kicker">Support desk / Queues & email</p>
      <h1>Queues & email</h1>
      <p>Route support tickets and configure email delivery.</p>
      {params.error ? <p className="mail-result bad" role="alert">{params.error}</p> : null}
      {params.saved && tab !== "outgoing" ? <p className="mail-result ok" role="status">Saved.</p> : null}
      <div className="ops-tabs">
        {TABS.map((item) => <Link key={item.id} href={`/admin/tickets/settings?tab=${item.id}`} data-current={tab === item.id ? "true" : undefined}>{item.label}</Link>)}
      </div>
      {tab === "topics" ? (
        <div className="ops">
          <div>
            <p><Link className="btn btn-primary" href="/admin/tickets/settings?tab=topics&topic=new">Add topic</Link></p>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Topic</th><th>Assigned group</th><th>Customers can choose this</th><th></th></tr></thead>
                <tbody>
                  {topics.map((item) => (
                    <tr key={item.id} data-current={!creatingTopic && topic?.id === item.id ? "true" : undefined}>
                      <td><strong>{item.name}</strong></td>
                      <td>{groupName.get(item.group_id) || "No group"}</td>
                      <td><span className={`ops-badge ${item.enabled ? "ok" : "muted"}`}>{item.enabled ? "Yes" : "No"}</span></td>
                      <td><Link className={`btn ${!creatingTopic && topic?.id === item.id ? "btn-primary" : "btn-secondary"}`} href={`/admin/tickets/settings?tab=topics&topic=${item.id}`}>Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="ops-drawer">
            <h2>{creatingTopic ? "Add topic" : "Edit topic"}</h2>
            <form className="ops-stack" action={saveRoutingTopic}>
              {topic && !creatingTopic ? <input type="hidden" name="id" value={topic.id} /> : null}
              <label>Topic <input name="name" defaultValue={creatingTopic ? "" : topic?.name || ""} required /></label>
              <label>Assigned group
                <select name="group_id" defaultValue={String(creatingTopic ? groups[0]?.id || "" : topic?.group_id || "")}>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <div className="ops-feature">
                <div><strong>Customers can choose this</strong><p>Tickets route to this group. Visibility follows group membership and the access level.</p></div>
                <label className="ops-toggle-row"><span>{creatingTopic || topic?.enabled ? "On" : "Off"}</span><span className="ops-toggle"><input type="checkbox" name="enabled" defaultChecked={creatingTopic || Boolean(topic?.enabled)} /><span /></span></label>
              </div>
              <p><Link href="/admin/tickets/settings?tab=groups">Manage group members</Link></p>
              <button className="btn btn-primary" type="submit">{creatingTopic ? "Add topic" : "Save topic"}</button>
            </form>
          </aside>
        </div>
      ) : null}
      {tab === "groups" ? (
        <div className="ops-stack">
          {groups.map((group) => {
            const chosen = new Set(members.filter((member) => member.group_id === group.id).map((member) => member.user_id));
            return (
              <article key={group.id} className="ops-card ops-stack" data-current={selectedGroup?.id === group.id ? "true" : undefined}>
                <form className="ops-stack" action={saveRoutingGroup}>
                  <input type="hidden" name="id" value={group.id} />
                  <label>Group name <input name="name" defaultValue={group.name} required /></label>
                  <label>Description <input name="description" defaultValue={group.description} /></label>
                  <button className="btn btn-secondary" type="submit">Save group</button>
                </form>
                <form className="ops-stack" action={saveRoutingMembers}>
                  <input type="hidden" name="group_id" value={group.id} />
                  <strong>Members</strong>
                  <p className="ops-muted">Staff in this group can see its tickets when their access level includes group tickets. Access every ticket shows every group.</p>
                  {staff.map((person) => (
                    <label key={person.id} className="check-option"><input type="checkbox" name="user_id" value={person.id} defaultChecked={chosen.has(person.id)} /> {person.name} · {person.email}</label>
                  ))}
                  <button className="btn btn-secondary" type="submit">Save members</button>
                </form>
              </article>
            );
          })}
          <form className="ops-card ops-stack" action={saveRoutingGroup}>
            <h2>New group</h2>
            <label>Name <input name="name" required /></label>
            <label>Description <input name="description" /></label>
            <button className="btn btn-primary" type="submit">Add group</button>
          </form>
        </div>
      ) : null}
      {tab === "inbound" ? (
        <div className="ops-card ops-stack">
          <h2>Inbound email</h2>
          <p>Incoming email can be posted to this endpoint to create or update a support ticket. Mailgun, Postmark, and SendGrid formats are accepted. A subject or body containing SC-123, or a reply to a message we sent, stays on that ticket. Otherwise a new ticket opens on the General topic.</p>
          <label>Endpoint <input readOnly value={endpoint} /></label>
          <CopyText value={endpoint} />
          <InboundSecret />
          <details className="ops-details">
            <summary>Setup guide</summary>
            <p>Send POST requests to the endpoint with header Authorization: Bearer and the secret. The secret is hidden after you leave this page.</p>
          </details>
        </div>
      ) : null}
      {tab === "outgoing" ? (
        <div className="ops">
          <div className="ops-stack">
          <form className="ops-card ops-stack" action={saveOutboundMail}>
            <h2>Outgoing email</h2>
            <p>Used to send notifications and replies from the support desk. For Google Workspace, save smtp.gmail.com and port 587.</p>
            {params.saved ? <p className="mail-result ok" role="status">Outgoing email saved. A blank password keeps the stored password.</p> : null}
            <label>Host <input name="smtp_host" defaultValue={mail?.smtp_host || ""} placeholder="smtp.example.com" /></label>
            <label>Port <input name="smtp_port" type="number" defaultValue={mail?.smtp_port || 587} /></label>
            <label>Username <input name="smtp_user" defaultValue={mail?.smtp_user || ""} autoComplete="off" /></label>
            <MailPassword stored={Boolean(mail?.smtp_pass)} />
            <label>From address <input name="smtp_from" type="email" defaultValue={mail?.smtp_from || ""} placeholder="support@sauticall.com" /></label>
            <label>Security
              <select name="smtp_secure" defaultValue={mail?.smtp_secure === 1 ? "on" : "0"}>
                <option value="0">STARTTLS</option>
                <option value="on">TLS from the start</option>
              </select>
            </label>
            <p className="ops-muted">Port 587 starts in plain text and upgrades after hello. Port 465 starts encrypted. This follows the saved port.</p>
            <button className="btn btn-primary" type="submit">Save outgoing email</button>
          </form>
          <section className="ops-card ops-stack">
            <h2>Inbound email</h2>
            <p>The endpoint and secret stay on the inbound tab. The saved secret is hidden.</p>
            <p><Link href="/admin/tickets/settings?tab=inbound">Open inbound settings</Link></p>
          </section>
          </div>
          <aside id="test-email" className="ops-card ops-stack">
            <h2>Test delivery</h2>
            <p>Send a test email using the saved configuration.</p>
            <form className="ops-stack" action={sendTestMail}>
              <label>Recipient <input name="to" type="email" required defaultValue={params.to || ""} placeholder="name@example.com" /></label>
              <TestMailSubmit />
            </form>
            <h3>Last result</h3>
            {lastResult ? <p className={params.test ? "mail-result bad" : "mail-result ok"} role="status">{lastResult}</p> : <p className="ops-muted">Not tested.</p>}
            <p className="ops-muted">A failure is also kept under Failed requests.</p>
          </aside>
        </div>
      ) : null}
      {tab === "diagnostics" ? (
        <form className="ops-card ops-stack" action={tryInboundMail}>
          <h2>Try an inbound email</h2>
          <p>This creates a ticket with the same rules as a provider post. It does not send mail through the provider.</p>
          <label>From <input name="from" type="email" required placeholder="customer@example.com" /></label>
          <label>Subject <input name="subject" placeholder="Cannot hear the caller" /></label>
          <label>Message <textarea name="text" rows={4} required /></label>
          <button className="btn btn-secondary" type="submit">Turn this into a ticket</button>
          <p><Link href="/admin/failures">Failed requests</Link></p>
        </form>
      ) : null}
    </div>
  );
}
