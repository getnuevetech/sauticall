import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";

type Row = { id: number; name: string; email: string; phone: string; company: string; service: string; body: string; kind: string; created_at: string };

function relativeTime(iso: string) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function sourceLabel(kind: string) {
  return kind === "custom_plan" ? "Custom plan" : "Contact form";
}

function EmptyInbox({ filtered }: { filtered: boolean }) {
  return (
    <section className="ops-empty">
      <span className="ops-mark" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M6 11.5 16 18l10-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <rect x="5" y="8" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M22 6.5l1.2-1.4M24.5 8.2l1.6-.2M23.2 10.2l.4 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <h2>{filtered ? "No matching messages" : "No messages yet"}</h2>
      <p>{filtered ? "No messages match this search." : "Contact and custom-plan inquiries will appear here."}</p>
    </section>
  );
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string; id?: string }> }) {
  await requirePermission("inbox.messages");
  const params = await searchParams;
  const source = params.source === "contact" || params.source === "custom_plan" ? params.source : "all";
  const rows = getDb().prepare(
    "SELECT id, name, email, phone, company, service, body, kind, created_at FROM messages ORDER BY id DESC LIMIT 100",
  ).all() as Row[];
  const needle = (params.q || "").trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (source !== "all" && row.kind !== source) return false;
    return !needle || `${row.name} ${row.email} ${row.company} ${row.service} ${row.body}`.toLowerCase().includes(needle);
  });
  const selected = visible.find((row) => row.id === Number(params.id)) || null;
  const reply = selected && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selected.email)
    ? `mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.service || "your SautiCall message"}`)}`
    : "";
  const href = (id = 0) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (source !== "all") query.set("source", source);
    if (id) query.set("id", String(id));
    const text = query.toString();
    return text ? `/admin/messages?${text}` : "/admin/messages";
  };
  return (
    <div className={`ops${selected ? "" : " ops-single"}`}>
      <div>
        <p className="ops-kicker">Support desk / Contact messages</p>
        <h1>Contact messages</h1>
        <p>Inquiries from the contact page and custom-plan form.</p>
        <nav className="ops-tabs">
          <Link href="/admin/messages" data-current={source === "all" ? "true" : undefined}>All messages</Link>
          <Link href="/admin/messages?source=contact" data-current={source === "contact" ? "true" : undefined}>Contact form</Link>
          <Link href="/admin/messages?source=custom_plan" data-current={source === "custom_plan" ? "true" : undefined}>Custom plan</Link>
        </nav>
        {rows.length > 0 ? (
          <form className="ops-toolbar" method="get">
            <input name="q" defaultValue={params.q || ""} placeholder="Search sender or message" aria-label="Search sender or message" />
            <select name="source" defaultValue={source} aria-label="Source">
              <option value="all">All sources</option>
              <option value="contact">Contact form</option>
              <option value="custom_plan">Custom plan</option>
            </select>
            <button className="btn btn-secondary" type="submit">Search</button>
          </form>
        ) : null}
        {visible.length === 0 ? <EmptyInbox filtered={rows.length > 0} /> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Sender</th><th>Subject</th><th>Source</th><th>Received</th></tr></thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} data-current={selected?.id === row.id ? "true" : undefined}>
                    <td><Link href={href(row.id)}><strong>{row.name}</strong><small>{row.email}</small></Link></td>
                    <td><Link href={href(row.id)}><strong>{row.service || "Message"}</strong><small>{row.body.replace(/\s+/g, " ").slice(0, 90)}</small></Link></td>
                    <td><span className="ops-badge info">{sourceLabel(row.kind)}</span></td>
                    <td>{relativeTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selected ? (
        <aside className="ops-drawer">
          <div className="ops-drawer-head">
            <h2>Message details</h2>
            <Link href={href()} aria-label="Close">×</Link>
          </div>
          <dl className="ops-facts">
            <div><dt>Source</dt><dd><span className="ops-badge info">{sourceLabel(selected.kind)}</span></dd></div>
            <div><dt>Received</dt><dd>{relativeTime(selected.created_at)}</dd></div>
            <div><dt>Sender</dt><dd>{selected.name}</dd></div>
            <div><dt>Email</dt><dd>{selected.email}</dd></div>
            {selected.company ? <div><dt>Company</dt><dd>{selected.company}</dd></div> : null}
            {selected.phone ? <div><dt>Phone</dt><dd>{selected.phone}</dd></div> : null}
          </dl>
          <h3>Message</h3>
          <p>{selected.body}</p>
          {reply ? (
            <p><a className="btn btn-secondary" href={reply}>Open email app</a> <span className="ops-muted">Opens your email client. Replies are not tracked here.</span></p>
          ) : <p className="ops-muted">This message has no email address, so a reply cannot be opened.</p>}
        </aside>
      ) : null}
    </div>
  );
}
