import Link from "next/link";
import { completeTrunk, retryTrunk } from "../actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";

type TrunkRow = {
  line_id: number;
  user_id: number;
  email: string;
  did: string;
  department_name: string;
  extension_number: string;
  sip_user: string;
  sip_host: string;
  note: string;
  password: string | null;
  line_status: string;
};

export default async function TrunksPage({ searchParams }: { searchParams: Promise<{ error?: string; user?: string }> }) {
  await requirePermission("settings.lines");
  const params = await searchParams;
  const userId = Number(params.user || 0);
  const rows = getDb().prepare(
    `SELECT t.line_id, t.user_id, u.email, t.did, t.department_name, t.extension_number, t.sip_user, t.sip_host, t.note,
            s.password, l.status AS line_status
     FROM trunk_tasks t
     JOIN users u ON u.id = t.user_id
     JOIN phone_lines l ON l.id = t.line_id
     LEFT JOIN voip_subaccounts s ON s.user_id = t.user_id
     WHERE t.status = 'open' ${userId ? "AND t.user_id = ?" : ""}
     ORDER BY t.id DESC`,
  ).all(...(userId ? [userId] : [])) as TrunkRow[];
  return (
    <>
      <span className="eyebrow">Phone</span>
      <h2>3CX trunks</h2>
      <p>These numbers have a VoIP.ms SIP account, and 3CX still needs the trunk, the inbound route, or the outbound rule. Each task is tied to the customer who bought the number. Finish that step on the 3CX server, then mark it done. The SIP password is shown here so the trunk can be entered on 3CX.</p>
      {userId ? <p><Link href="/admin/trunks">Show every waiting trunk</Link></p> : null}
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {rows.length === 0 ? <p>No 3CX trunks are waiting.</p> : null}
      {rows.map((row) => (
        <article key={row.line_id} className="feature-card" style={{ marginTop: 16 }}>
          <h3>{row.did}</h3>
          <p>{row.email} · {row.line_status === "trunk_waiting" ? "Waiting for 3CX" : row.line_status}</p>
          <p><Link href={`/admin/customers/${row.user_id}`}>Open this customer</Link></p>
          <p>Department {row.department_name || "company name not set"}. Send inbound calls to extension {row.extension_number}.</p>
          <p>SIP server {row.sip_host || "the VoIP.ms POP"}. SIP username {row.sip_user || "not created yet"}.</p>
          {row.password ? <p>SIP password <code>{row.password}</code></p> : <p>No SIP password is saved for this customer yet.</p>}
          {row.note ? <p>{row.note}</p> : null}
          <form action={retryTrunk}>
            <input type="hidden" name="id" value={row.line_id} />
            <button className="btn btn-secondary" type="submit">Try adding the trunk again</button>
          </form>
          <form action={completeTrunk} className="form-grid">
            <input type="hidden" name="id" value={row.line_id} />
            <label>Note <input name="note" placeholder="Added on the 3CX server" /></label>
            <button className="btn btn-primary" type="submit">Mark the trunk as done on the server</button>
          </form>
        </article>
      ))}
    </>
  );
}
