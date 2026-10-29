import { TestMailSubmit } from "@/components/admin/TestMailSubmit";
import { rotateMailSecret, saveOutboundMail, saveRoutingGroup, saveRoutingMembers, saveRoutingTopic, sendTestMail, tryInboundMail } from "../../desk-actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";
import { mailSettings } from "@/lib/tickets";

export default async function TicketSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; notice?: string; test?: string; to?: string }> }) {
  await requirePermission("tickets.manage");
  const params = await searchParams;
  const groups = getDb().prepare("SELECT id, name, description FROM ticket_groups ORDER BY name").all() as { id: number; name: string; description: string }[];
  const topics = getDb().prepare("SELECT id, name, group_id, enabled FROM ticket_topics ORDER BY name").all() as { id: number; name: string; group_id: number; enabled: number }[];
  const staff = getDb().prepare("SELECT id, name, email, role FROM users WHERE role IN ('staff', 'super_admin') ORDER BY name").all() as { id: number; name: string; email: string; role: string }[];
  const members = getDb().prepare("SELECT group_id, user_id FROM ticket_group_members").all() as { group_id: number; user_id: number }[];
  const mail = mailSettings();
  const origin = process.env.SAUTICALL_PUBLIC_ORIGIN || "https://your-site";
  return (
    <>
      <span className="eyebrow">Support</span>
      <h2>Ticket routing and email</h2>
      <p>A topic sends a new ticket to one group. Only staff in that group see it, unless their access level includes every ticket. Point your inbound email provider at the address below so a new email becomes a ticket and a reply stays on the same ticket.</p>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      <article className="feature-card" style={{ marginBottom: 16 }}>
        <h3>Inbound email</h3>
        <p>POST {origin}/api/tickets/inbound</p>
        <p>Send header Authorization: Bearer and the secret below. Mailgun, Postmark, and SendGrid inbound formats are accepted. A subject or body containing SC-123, or a reply to a message we sent, updates that ticket. Otherwise a new ticket opens on the General topic.</p>
        <p>Secret: {mail?.inbound_secret}</p>
        <form action={rotateMailSecret}><button className="btn btn-secondary" type="submit">Create a new secret</button></form>
      </article>
      <form className="contact-form" action={saveOutboundMail} style={{ marginBottom: 18 }}>
        <h3>Outgoing email</h3>
        <p>Replies to customers, notices to the group, and account confirmation codes are sent from here. Leave the password blank to keep the saved one. For Google Workspace, use smtp.gmail.com and port 587. smtp.google.com does not accept outgoing mail.</p>
        <div className="form-grid">
          <label>SMTP host <input name="smtp_host" defaultValue={mail?.smtp_host || ""} placeholder="smtp.example.com" /></label>
          <label>Port <input name="smtp_port" type="number" defaultValue={mail?.smtp_port || 587} /></label>
        </div>
        <div className="form-grid">
          <label>Username <input name="smtp_user" defaultValue={mail?.smtp_user || ""} /></label>
          <label>Password <input name="smtp_pass" type="password" placeholder={mail?.smtp_pass ? "Saved" : ""} /></label>
        </div>
        <label>From address <input name="smtp_from" type="email" defaultValue={mail?.smtp_from || ""} placeholder="support@sauticall.com" /></label>
        <label className="check-option"><input type="checkbox" name="smtp_secure" defaultChecked={mail?.smtp_secure === 1} /> Use a secure connection from the start (port 465). Port 587 upgrades after hello.</label>
        <button className="btn btn-primary" type="submit">Save outgoing email</button>
      </form>
      <form id="test-email" className="contact-form" action={sendTestMail} style={{ marginBottom: 18 }}>
        <h3>Send a test email</h3>
        <p>This uses the saved outgoing mail. The result appears here as soon as the mail server answers. Failures are also kept under Failed requests.</p>
        {params.sent ? <p className="mail-result ok" role="status">{params.notice || `Sent to ${params.to || "that address"}. The mail server accepted it.`}</p> : null}
        {params.test ? <p className="mail-result bad" role="alert">{params.test}</p> : null}
        <div className="mail-test">
          <label>To <input name="to" type="email" required defaultValue={params.to || ""} placeholder="you@example.com" /></label>
          <TestMailSubmit />
        </div>
      </form>
      <form className="contact-form" action={tryInboundMail} style={{ marginBottom: 18 }}>
        <h3>Try an inbound email</h3>
        <label>From <input name="from" type="email" required placeholder="customer@example.com" /></label>
        <label>Subject <input name="subject" placeholder="Cannot hear the caller" /></label>
        <label>Message <textarea name="text" rows={4} required /></label>
        <button className="btn btn-secondary" type="submit">Turn this into a ticket</button>
      </form>
      {groups.map((group) => {
        const chosen = new Set(members.filter((member) => member.group_id === group.id).map((member) => member.user_id));
        return (
          <article key={group.id} className="feature-card" style={{ marginBottom: 16 }}>
            <form action={saveRoutingGroup}>
              <input type="hidden" name="id" value={group.id} />
              <label>Group name <input name="name" defaultValue={group.name} required /></label>
              <label>Description <input name="description" defaultValue={group.description} /></label>
              <button className="btn btn-secondary" type="submit">Save group</button>
            </form>
            <form action={saveRoutingMembers} style={{ marginTop: 12 }}>
              <input type="hidden" name="group_id" value={group.id} />
              <div className="check-list">
                {staff.map((person) => (
                  <label key={person.id}><input type="checkbox" name="user_id" value={person.id} defaultChecked={chosen.has(person.id)} /> {person.name} · {person.email}</label>
                ))}
              </div>
              <button className="btn btn-secondary" type="submit">Save members</button>
            </form>
          </article>
        );
      })}
      <form className="contact-form" action={saveRoutingGroup} style={{ marginBottom: 18 }}>
        <h3>New group</h3>
        <label>Name <input name="name" required /></label>
        <label>Description <input name="description" /></label>
        <button className="btn btn-primary" type="submit">Add group</button>
      </form>
      <h3>Topics</h3>
      {topics.map((topic) => (
        <form key={topic.id} className="contact-form" action={saveRoutingTopic} style={{ marginBottom: 12 }}>
          <input type="hidden" name="id" value={topic.id} />
          <div className="form-grid">
            <label>Topic <input name="name" defaultValue={topic.name} required /></label>
            <label>Goes to
              <select name="group_id" defaultValue={String(topic.group_id)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          </div>
          <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={topic.enabled === 1} /> Customers can choose this</label>
          <button className="btn btn-secondary" type="submit">Save topic</button>
        </form>
      ))}
      <form className="contact-form" action={saveRoutingTopic}>
        <h3>New topic</h3>
        <div className="form-grid">
          <label>Topic <input name="name" required /></label>
          <label>Goes to
            <select name="group_id">
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
        </div>
        <label className="check-option"><input type="checkbox" name="enabled" defaultChecked /> Customers can choose this</label>
        <button className="btn btn-primary" type="submit">Add topic</button>
      </form>
    </>
  );
}
