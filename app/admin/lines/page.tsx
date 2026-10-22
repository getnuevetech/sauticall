import { completeEmergency, completeTrunk, retryTrunk, sendEmergencyAddress, syncMinutes } from "../actions";
import { flagOn, getDb } from "@/lib/db";
import { formatAddress, parseEmergency, type EmergencyAddress } from "@/lib/e911";

type LineRow = {
  id: number;
  email: string;
  did: string;
  status: string;
  last_message: string;
  department_name: string | null;
  extension_number: string | null;
  sip_user: string | null;
  sip_host: string | null;
  task_status: string | null;
  note: string | null;
  password: string | null;
  locked: number | null;
  e911_json: string;
  e911_status: string;
  e911_message: string;
};

const STATUS: Record<string, string> = {
  ordered: "Number bought",
  trunk_live: "Trunk added on the phone system",
  trunk_waiting: "Waiting for the trunk to be finished",
  trunk_done: "Marked done on the 3CX server",
};

const E911: Record<string, string> = {
  missing: "Emergency address missing",
  saved: "Emergency address saved here",
  sent: "Emergency address sent to the phone company",
  needs_person: "Emergency address needs a person",
  done: "Emergency address marked done",
};

function addressText(raw: string) {
  try {
    const parsed = parseEmergency(JSON.parse(raw) as Record<string, string>);
    return parsed.ok ? formatAddress(parsed.address as EmergencyAddress) : "";
  } catch {
    return "";
  }
}

export default async function LinesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const params = await searchParams;
  const rows = getDb().prepare(
    `SELECT l.id, u.email, l.did, l.status, l.last_message,
            t.department_name, t.extension_number, t.sip_user, t.sip_host, t.status AS task_status, t.note,
            s.password, s.locked, l.e911_json, l.e911_status, l.e911_message
     FROM phone_lines l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN trunk_tasks t ON t.line_id = l.id
     LEFT JOIN voip_subaccounts s ON s.user_id = l.user_id
     ORDER BY l.id DESC LIMIT 50`,
  ).all() as LineRow[];
  const reading = flagOn("minutes.live_sync");
  const limiting = flagOn("minutes.enforce");
  const trunks = flagOn("pbx.live_trunk");
  return (
    <>
      <span className="eyebrow">Settings</span>
      <h2>Lines and trunks</h2>
      <p>When a number is bought, SautiCall creates a VoIP.ms line account for that customer and tries to use the number as the SIP trunk for their department. If 3CX does not accept the trunk, finish it on the 3CX server with the details below, then mark it done. The emergency address is sent to VoIP.ms with the same switch as buying numbers. If VoIP.ms does not accept it, finish it there and mark it done.</p>
      <p>{reading ? "Reading call minutes is on." : "Reading call minutes is off."} {limiting ? "Outbound calls stop at VoIP.ms when the balance is zero." : "Outbound calls are not stopped at VoIP.ms yet."} {trunks ? "Adding trunks from here is on." : "Adding trunks from here is off, so new numbers wait for the team."}</p>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {params.saved ? <p>Call minutes were updated.</p> : null}
      <form action={syncMinutes}><button className="btn btn-secondary" type="submit">Read minutes and apply limits</button></form>
      {rows.length === 0 ? <p>No numbers have been bought yet.</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="feature-card" style={{ marginTop: 16 }}>
          <h3>{row.did}</h3>
          <p>{row.email} · {STATUS[row.status] || row.status}{row.locked ? " · outbound stopped" : ""}</p>
          {row.last_message ? <p>{row.last_message}</p> : null}
          <p>{E911[row.e911_status] || row.e911_status}{addressText(row.e911_json) ? ` · ${addressText(row.e911_json)}` : ""}</p>
          {row.e911_message ? <p>{row.e911_message}</p> : null}
          <form action={sendEmergencyAddress}>
            <input type="hidden" name="id" value={row.id} />
            <button className="btn btn-secondary" type="submit">Send emergency address</button>
          </form>
          <form action={completeEmergency} className="form-grid">
            <input type="hidden" name="id" value={row.id} />
            <label>Note <input name="note" placeholder="Entered on the phone company" /></label>
            <button className="btn btn-secondary" type="submit">Mark the emergency address as done</button>
          </form>
          {row.task_status === "open" ? (
            <>
              <p>Department {row.department_name}. Send inbound calls to extension {row.extension_number}.</p>
              <p>SIP server {row.sip_host || "the VoIP.ms POP"}. SIP username {row.sip_user || "not created yet"}.</p>
              {row.password ? <p>SIP password <code>{row.password}</code></p> : null}
              <p>{row.note}</p>
              <form action={completeTrunk} className="form-grid">
                <input type="hidden" name="id" value={row.id} />
                <label>Note <input name="note" placeholder="Added on the 3CX server" /></label>
                <button className="btn btn-primary" type="submit">Mark the trunk as done on the server</button>
              </form>
            </>
          ) : null}
          <form action={retryTrunk}>
            <input type="hidden" name="id" value={row.id} />
            <button className="btn btn-secondary" type="submit">Try adding the trunk again</button>
          </form>
        </article>
      ))}
    </>
  );
}
