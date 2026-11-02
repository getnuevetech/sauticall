import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { listAllAgents, listCapabilities, listManualTasks } from "@/lib/ai-virtual-store";
import { callControlReport } from "@/lib/call-control-service";
import { probeCallControlForm, recordVirtualBindingForm, startCallControlForm, stopCallControlForm } from "./actions";

export default async function AiDestinationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const agents = listAllAgents();
  const tasks = listManualTasks();
  const capabilities = listCapabilities();
  const report = callControlReport();
  const saved = query.saved === "probe"
    ? "Call Control was checked on the existing 3CX connection. No call was placed."
    : query.saved === "listen"
      ? "Listening on the existing Service Principal. Dial its Client ID from a registered extension."
      : query.saved === "stopped"
        ? "Stopped listening. No call was placed."
        : query.saved
          ? "Identifier recorded. The route was not moved and the destination was not certified."
          : "";
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Virtual destinations</p>
        <h1>Virtual destinations</h1>
        <AiSectionNav current="destinations" />
        <p>AI extensions are virtual destinations on the 3CX connection already used for trunks and extensions. No desk phone, softphone, or extra trunk is created for them. A recorded Client ID is not certified by itself. Nothing on this page places an outbound call.</p>
        <h2>Existing connection</h2>
        <p>{report.host ? `3CX host ${report.host}.` : "No 3CX host is stored on this server."} {report.xapi || "The XAPI connection has not been checked."}</p>
        <ul>
          {report.stored.reused.map((item) => <li key={item}>{item}</li>)}
        </ul>
        {report.stored.missing ? <p>{report.stored.missing}</p> : null}
        <p>{report.realtime ? `Realtime voice engine: ${report.realtime.name} (${report.realtime.protocol}).` : "No enabled realtime voice engine is stored. Text engines stay available for drafts."} {report.textEngines.length ? `Enabled engines: ${report.textEngines.join(", ")}.` : ""}</p>
        <p>AI switches: master {report.switches.master ? "on" : "off"}, receptionist {report.switches.receptionist ? "on" : "off"}. Listener: {report.listening ? "running" : "stopped"}.</p>
        {capabilities.filter((item) => item.capability === "call_control" || item.capability === "programmable_extensions").map((item) => (
          <p key={item.capability}>{item.capability}: {item.status}. {item.evidence}</p>
        ))}
        <form action={probeCallControlForm}><button className="btn btn-secondary" type="submit">Check Call Control on the existing connection</button></form>
        <form action={startCallControlForm}><button className="btn btn-secondary" type="submit">Listen for calls</button></form>
        <form action={stopCallControlForm}><button className="btn btn-secondary" type="submit">Stop listening</button></form>
        {saved ? <p className="form-feedback">{saved}</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <h2>Call results</h2>
        {report.calls.length === 0 ? <p>No live call has been recorded. A text preview is not listed here.</p> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Participant</th><th>State</th><th>Audio both ways</th><th>Outbound</th><th>Outcome</th></tr></thead>
              <tbody>
                {report.calls.map((call) => (
                  <tr key={call.id}>
                    <td>{call.pbx_call_id}</td>
                    <td>{call.state}</td>
                    <td>{call.media_open === 1 ? "yes" : "no"}</td>
                    <td>{call.place_call === 0 ? "not placed" : "placed"}</td>
                    <td>{call.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2>Capabilities</h2>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Capability</th><th>Status</th></tr></thead>
            <tbody>
              {capabilities.map((item) => <tr key={item.capability}><td>{item.capability}</td><td>{item.status}</td></tr>)}
            </tbody>
          </table>
        </div>
        <h2>AI extensions</h2>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Name</th><th>Account</th><th>Engine</th><th>Number</th><th>Status</th><th>Record identifier</th></tr></thead>
            <tbody>
              {agents.length === 0 ? <tr><td colSpan={6}>No AI extension is saved.</td></tr> : agents.map((agent) => (
                <tr key={agent.id}>
                  <td>{agent.name}</td>
                  <td>{agent.user_id}</td>
                  <td>{engineLabel(agent.execution_engine)}{agent.prompt_sync === "NOT_SYNCED_NATIVE" ? " · prompt not synced" : ""}</td>
                  <td>{agent.did}</td>
                  <td>{customerAgentMessage(agent.status)}</td>
                  <td>
                    <form action={recordVirtualBindingForm}>
                      <input type="hidden" name="agent_id" value={agent.id} />
                      <input name="resource_id" aria-label={`3CX identifier for ${agent.name}`} placeholder="Client ID or native agent id" />
                      <input name="note" aria-label={`Note for ${agent.name}`} placeholder="Where this was created" />
                      <button className="btn btn-secondary" type="submit">Record</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>Administrator steps</h2>
        {tasks.length === 0 ? <p>No open phone-system step.</p> : (
          <ul>
            {tasks.map((task) => <li key={task.id}>{task.email}: {task.required_action} {task.verification_status === "recorded_unverified" ? "Identifier recorded, not certified." : ""}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
