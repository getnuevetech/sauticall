import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { listPurposes, listSuppressions, notifyPolicy } from "@/lib/ai-notify-store";
import { getDb } from "@/lib/db";
import { removePurposeForm, saveNotifyPolicyForm, savePurposeForm } from "./actions";

export default async function AiNotifyAdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const policy = notifyPolicy();
  const purposes = listPurposes();
  const stopped = listSuppressions();
  const names = new Map((getDb().prepare("SELECT id, email FROM users").all() as { id: number; email: string }[]).map((row) => [row.id, row.email]));
  const notice = query.saved === "policy" ? "Notification rules saved. No call was placed."
    : query.saved === "purpose" ? "Purpose saved. No call was placed."
      : query.saved === "removed" ? "Purpose removed."
        : "";
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Notifications</p>
        <h1>Notifications</h1>
        <AiSectionNav current="notify" />
        <p>Press 1 plays the kept message, press 2 declines it, and press 9 opts out. Silence is not a yes. These screens do not place a call.</p>
        {notice ? <p className="form-feedback">{notice}</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <form action={saveNotifyPolicyForm} className="ops-card ops-stack">
          <h2>Rules</h2>
          <label>Repeats after silence or another key
            <input name="repeats" type="number" min={0} max={2} defaultValue={policy.repeats} required />
          </label>
          <label>Opening time <input name="window_start" defaultValue={policy.windowStart} placeholder="09:00" /></label>
          <label>Closing time <input name="window_end" defaultValue={policy.windowEnd} placeholder="17:00" /></label>
          <label>Time zone <input name="time_zone" defaultValue={policy.timeZone} placeholder="America/Chicago" /></label>
          <label className="audio-check"><input type="checkbox" name="promo" defaultChecked={policy.promoEnabled} /> Allow promotional purposes</label>
          <button className="btn btn-primary" type="submit">Save rules</button>
        </form>
        <form action={savePurposeForm} className="ops-card ops-stack">
          <h2>Add a purpose</h2>
          <label>Name <input name="label" required /></label>
          <label className="audio-check"><input type="checkbox" name="promotional" /> Promotional</label>
          <label className="audio-check"><input type="checkbox" name="enabled" /> Turn on for customers</label>
          <button className="btn btn-primary" type="submit">Save purpose</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Purpose</th><th>Kind</th><th></th></tr></thead>
            <tbody>
              {purposes.map((purpose) => (
                <tr key={purpose.code}>
                  <td><strong>{purpose.label}</strong><small>{purpose.enabled ? "On" : "Off"}</small></td>
                  <td>{purpose.promotional ? "Promotional" : "Service"}</td>
                  <td>
                    <form action={removePurposeForm}><input type="hidden" name="code" value={purpose.code} /><button className="btn btn-secondary" type="submit">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ops-card">
          <h2>Opt-outs</h2>
          {stopped.length === 0 ? <p>No one has opted out.</p> : (
            <ul>
              {stopped.map((row) => <li key={`${row.user_id}-${row.e164}`}>{names.get(row.user_id) || "Account"} · {row.e164}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
