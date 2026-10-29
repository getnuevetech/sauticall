import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { AI_ENGINE_KINDS, AI_FUNCTIONS, featureReady } from "@/lib/ai-system";
import { enabledSwitchCodes, listAiAssignments, listAiEngines, listAiSwitches } from "@/lib/ai-store";
import { removeAiEngine, saveAiAssignmentForm, saveAiEngineForm, saveAiSwitchForm } from "./actions";

const KIND_LABEL: Record<string, string> = { tts: "Text to voice", stt: "Speech to text", llm: "Language model" };

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
        <p>Turn services on or off, register each model, and choose which model does each job. Settings apply after you save.</p>
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
          <p>One engine can speak text. Another can run outbound calls. Leave a job blank until an engine is ready.</p>
          {AI_FUNCTIONS.map((job) => (
            <label key={job.code}>
              {job.label}
              <small>{job.detail}</small>
              <select name={`job_${job.code}`} defaultValue={String(assignments.get(job.code) || "")}>
                <option value="">Not assigned</option>
                {readyEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.name} · {KIND_LABEL[engine.kind] || engine.kind}</option>)}
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
            <p className="ops-kicker">{selected ? (KIND_LABEL[selected.kind] || selected.kind) : "In-house model"}</p>
          </div>
          {selected ? <Link href="/admin/ai?new=1" aria-label="Close">×</Link> : null}
        </div>
        <form action={saveAiEngineForm} className="ops-stack">
          {selected ? <input type="hidden" name="id" value={selected.id} /> : null}
          <label>Name <input name="name" defaultValue={selected?.name || ""} required /></label>
          <label>Kind
            <select name="kind" defaultValue={selected?.kind || "tts"}>
              {AI_ENGINE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
            </select>
          </label>
          <label>Model name <input name="model" defaultValue={selected?.model || ""} placeholder="sauticall-voice-1" required /></label>
          <label>Service address <input name="endpoint" defaultValue={selected?.endpoint || ""} placeholder="https://voice.internal.example" /></label>
          <label>Secret reference <input name="secret_ref" defaultValue={selected?.secretRef || ""} placeholder="vault:ai-voice" autoComplete="off" /></label>
          <label className="ops-toggle-row"><span className="ops-toggle"><input type="checkbox" name="enabled" defaultChecked={selected?.enabled || false} /><span /></span> Engine is on</label>
          <div className="ops-actions"><button className="btn btn-primary" type="submit">{selected ? "Save engine" : "Add engine"}</button></div>
        </form>
        {engines.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Engine</th><th>Job readiness</th></tr></thead>
              <tbody>
                {engines.map((engine) => (
                  <tr key={engine.id} data-current={selected?.id === engine.id ? "true" : undefined}>
                    <td><Link href={`/admin/ai?id=${engine.id}`}><strong>{engine.name}</strong></Link><small>{engine.model}</small></td>
                    <td><span className={`ops-badge ${engine.enabled ? "ok" : "muted"}`}>{engine.enabled ? "On" : "Off"}</span></td>
                  </tr>
                ))}
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
