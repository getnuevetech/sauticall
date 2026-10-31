import Link from "next/link";
import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { SecretField } from "@/components/admin/SecretField";
import { requirePermission } from "@/lib/access";
import { AI_FUNCTIONS, featureReady } from "@/lib/ai-system";
import { enabledSwitchCodes, listAiAssignments, listAiEngines, listAiSwitches } from "@/lib/ai-store";
import { flagOn } from "@/lib/db";
import { removeAiEngine, saveAiAssignmentForm, saveAiEngineForm, saveAiSwitchForm } from "./actions";

export default async function AiSystemPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; id?: string; new?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const switches = listAiSwitches();
  const engines = listAiEngines();
  const assignments = new Map(listAiAssignments().map((row) => [row.function_code, row.engine_id]));
  const enabled = enabledSwitchCodes();
  const creating = query.new === "1";
  const selected = creating ? undefined : engines.find((item) => item.id === Number(query.id)) || undefined;
  const readyEngines = engines.filter((item) => item.enabled);
  const notice = query.saved === "switches" ? "Switches saved. No call was placed."
    : query.saved === "engine" ? "Engine saved. No call was placed."
      : query.saved === "jobs" ? "Job assignments saved. No call was placed."
        : query.saved === "removed" ? "Engine removed."
          : "";
  return (
    <div className="ops">
      <div>
        <p className="ops-kicker">AI System</p>
        <h1>AI System</h1>
        <AiSectionNav current="system" />
        <p>Turn services on or off, register each model, and choose which model does each job. Settings apply after you save.</p>
        <p>Add as many engines as you need. An engine is not limited to one job. Give it a name, the model id, its https address, and an API key. The key is stored on this server and is not shown again. Turn the engine on, then choose it for any jobs it should handle. This server does not include a built-in model. Nothing on this page places a call.</p>
        <p>Outbound tests use the customer's 3CX extension and trunk. {flagOn("pbx.live_trunk") ? "Adding that trunk is on." : "Adding that trunk is off."} {flagOn("pbx.voipms_backup") ? "VoIP.ms backup is on and uses the customer's client after a confirmed trunk failure." : "VoIP.ms backup is off. Only an administrator can turn it on in Platform controls."} Nothing on this page places a call.</p>
        {notice ? <p className="form-feedback">{notice}</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <form action={saveAiSwitchForm} className="ops-card">
          <h2>Global switches</h2>
          {switches.map((item) => (
            <div className="ops-feature" key={item.code}>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                {item.code !== "master" ? <small>{featureReady(enabled, item.code) ? "Open for customers whose plan includes it." : "Closed. New sessions for this service stay off."}</small> : null}
              </div>
              <label className="ops-toggle">
                <input type="checkbox" name={`switch_${item.code}`} defaultChecked={item.enabled} aria-label={item.label} />
                <span />
              </label>
            </div>
          ))}
          <div className="ops-actions"><button className="btn btn-primary" type="submit">Save switches</button></div>
        </form>
        <form action={saveAiAssignmentForm} className="ops-card">
          <h2>Job assignments</h2>
          <p>Every engine that is on can be chosen for any job. The same engine can be selected for more than one job. Leave a job blank until an engine is ready.</p>
          {AI_FUNCTIONS.map((job) => (
            <label key={job.code}>
              {job.label}
              <small>{job.detail}</small>
              <select name={`job_${job.code}`} defaultValue={String(assignments.get(job.code) || "")}>
                <option value="">Not assigned</option>
                {readyEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.name} · {engine.model}</option>)}
              </select>
            </label>
          ))}
          <div className="ops-actions"><button className="btn btn-primary" type="submit">Save assignments</button></div>
        </form>
      </div>
      <aside className="ops-drawer">
        <div className="ops-drawer-head">
          <div>
            <h2>{selected ? selected.name : "Add an engine"}</h2>
            <p className="ops-kicker">{selected ? selected.model : "Any service you connect"}</p>
          </div>
          {selected ? <Link href="/admin/ai?new=1">Add another engine</Link> : null}
        </div>
        <form action={saveAiEngineForm} className="ops-stack">
          {selected ? <input type="hidden" name="id" value={selected.id} /> : null}
          <input type="hidden" name="kind" value={selected?.kind || "llm"} />
          <label>Name <input name="name" defaultValue={selected?.name || ""} required /></label>
          <label>Model name <input name="model" defaultValue={selected?.model || ""} placeholder="Model id from that service" required /></label>
          <label>Service address <input name="endpoint" defaultValue={selected?.endpoint || ""} placeholder="https://" /></label>
          <SecretField name="secret" label="API key" stored={Boolean(selected?.hasSecret)} hint="Stored write-only" />
          <p className="ops-muted">Leave the key blank to keep the saved key. After this engine is on, choose it for any jobs below. Add another engine from the list when you need a second service.</p>
          <label className="ops-toggle-row"><span className="ops-toggle"><input type="checkbox" name="enabled" defaultChecked={selected?.enabled || false} /><span /></span> Engine is on</label>
          <div className="ops-actions"><button className="btn btn-primary" type="submit">{selected ? "Save engine" : "Add engine"}</button></div>
        </form>
        {engines.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Engine</th><th>Jobs</th></tr></thead>
              <tbody>
                {engines.map((engine) => {
                  const jobs = AI_FUNCTIONS.filter((job) => assignments.get(job.code) === engine.id).map((job) => job.label);
                  return (
                  <tr key={engine.id} data-current={selected?.id === engine.id ? "true" : undefined}>
                    <td><Link href={`/admin/ai?id=${engine.id}`}><strong>{engine.name}</strong></Link><small>{engine.model}</small></td>
                    <td><span className={`ops-badge ${engine.enabled ? "ok" : "muted"}`}>{engine.enabled ? "On" : "Off"}</span>{jobs.length ? <small>{jobs.join(", ")}</small> : null}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="ops-muted">No engines yet. Add the first model on this panel.</p>}
        {selected ? (
          <form action={removeAiEngine}>
            <input type="hidden" name="id" value={selected.id} />
            <button className="btn btn-secondary" type="submit">Remove engine</button>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
