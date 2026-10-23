import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";

export default async function MessagesPage() {
  await requirePermission("inbox.messages");
  const rows = getDb().prepare("SELECT name, email, phone, company, service, body, kind, created_at FROM messages ORDER BY id DESC LIMIT 50").all() as {
    name: string;
    email: string;
    phone: string;
    company: string;
    service: string;
    body: string;
    kind: string;
    created_at: string;
  }[];
  return (
    <>
      <span className="eyebrow">Customers</span>
      <h2>Contact messages</h2>
      <p>People who wrote in from the contact page or the custom-plan form.</p>
      {rows.length === 0 ? <p>No messages yet.</p> : null}
      {rows.map((row) => (
        <article key={row.created_at + row.email + row.kind} className="feature-card" style={{ marginBottom: 12 }}>
          <h3>{row.name}</h3>
          <p>{row.kind === "custom_plan" ? "Custom plan" : "Contact"} · {row.email}{row.phone ? ` · ${row.phone}` : ""}{row.company ? ` · ${row.company}` : ""}</p>
          <p>{row.service}</p>
          <p>{row.body}</p>
        </article>
      ))}
    </>
  );
}
