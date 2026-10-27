import Link from "next/link";
import { requireAnyPermission } from "@/lib/access";
import { getDb } from "@/lib/db";
import { formatWhen } from "@/lib/format-when";

const AREAS = [
  { value: "", label: "All" },
  { value: "number", label: "Number buy" },
  { value: "extension", label: "Extension" },
  { value: "group", label: "Ring group or queue" },
  { value: "payment", label: "Payment" },
  { value: "trunk", label: "Trunk" },
  { value: "transfer", label: "Number transfer" },
  { value: "emergency", label: "Emergency address" },
  { value: "minutes", label: "Call minutes" },
  { value: "client", label: "Phone-company client" },
  { value: "connection", label: "Connection check" },
  { value: "email", label: "Email" },
];

type Row = { id: number; area: string; subject: string; detail: string; created_at: string; email: string | null };

export default async function FailuresPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  await requireAnyPermission(["inbox.requests", "settings.phone", "settings.lines", "settings.payments"]);
  const params = await searchParams;
  const area = AREAS.some((item) => item.value === params.area) ? params.area || "" : "";
  const rows = (area
    ? getDb().prepare(
      `SELECT f.id, f.area, f.subject, f.detail, f.created_at, u.email
       FROM failure_log f LEFT JOIN users u ON u.id = f.user_id
       WHERE f.area = ? ORDER BY f.id DESC LIMIT 200`,
    ).all(area)
    : getDb().prepare(
      `SELECT f.id, f.area, f.subject, f.detail, f.created_at, u.email
       FROM failure_log f LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.id DESC LIMIT 200`,
    ).all()) as Row[];
  const label = (value: string) => AREAS.find((item) => item.value === value)?.label || value;
  return (
    <>
      <span className="eyebrow">Customers</span>
      <h2>Failed requests</h2>
      <p>This is the reply from VoIP.ms, 3CX, Stripe, PayPal, Square, or the mail server when a request does not succeed. Customers still see a short message. The text here is the one the other system sent.</p>
      <p>
        {AREAS.map((item) => (
          <Link key={item.value || "all"} href={item.value ? `/admin/failures?area=${item.value}` : "/admin/failures"} style={{ marginRight: 12, fontWeight: item.value === area ? 800 : 500 }}>
            {item.label}
          </Link>
        ))}
      </p>
      {rows.length === 0 ? <p>No failed requests in this list.</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="feature-card" style={{ marginBottom: 16 }}>
          <h3>{label(row.area)} · {row.subject || "Request"}</h3>
          <p>{row.email || "No customer"} · {formatWhen(row.created_at)}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{row.detail}</p>
        </article>
      ))}
    </>
  );
}
