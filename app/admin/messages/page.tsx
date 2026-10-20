import { getDb } from "@/lib/db";

export default function MessagesPage() {
  const rows = getDb().prepare("SELECT name, email, service, body, created_at FROM messages ORDER BY id DESC LIMIT 50").all() as {
    name: string;
    email: string;
    service: string;
    body: string;
    created_at: string;
  }[];
  return (
    <>
      <span className="eyebrow">INBOX</span>
      <h2>Contact messages</h2>
      {rows.length === 0 ? <p>No messages yet.</p> : null}
      {rows.map((row) => (
        <article key={row.created_at + row.email} className="feature-card" style={{ marginBottom: 12 }}>
          <h3>{row.name}</h3>
          <p>{row.email} · {row.service}</p>
          <p>{row.body}</p>
        </article>
      ))}
    </>
  );
}
