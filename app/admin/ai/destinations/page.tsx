import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { listAllAgents, listCapabilities, listManualTasks } from "@/lib/ai-virtual-store";
import { recordVirtualBindingForm } from "./actions";

export default async function AiDestinationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const agents = listAllAgents();
  const tasks = listManualTasks();
  const capabilities = listCapabilities();
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Virtual destinations</p>
        <h1>Virtual destinations</h1>
        <AiSectionNav current="destinations" />
        <p>AI extensions are virtual destinations. A phone-system user is not created for them, and a recorded Client ID is not treated as certified. The customer number stays on the ring group until a 3CX read-back confirms the destination. Nothing on this page places a call.</p>
        {query.saved ? <p className="form-feedback">Identifier recorded. The route was not moved and the destination was not certified.</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
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
