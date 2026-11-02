import Link from "next/link";
import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { engineLabel } from "@/lib/ai-virtual";
import { listAllAgents, type VirtualAgent } from "@/lib/ai-virtual-store";
import { callControlReport } from "@/lib/call-control-service";
import { isPhoneExtensionNumber, phoneExtensionRouteMessage, servicePrincipalDirections } from "@/lib/call-control-plan";
import { probeCallControlForm, recordVirtualBindingForm, startCallControlForm, stopCallControlForm } from "./actions";

export default async function AiDestinationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const agents = listAllAgents();
  const report = callControlReport();
  const callControl = report.capabilities.find((item) => item.capability === "call_control");
  const problems = connectionProblems(report, callControl?.status || "unverified");
  const saved = savedMessage(query.saved);
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Virtual destinations</p>
        <h1>Virtual destinations</h1>
        <AiSectionNav current="destinations" />
        {query.error ? <p className="ops-alert" role="alert">{query.error}</p> : null}
        {saved ? <p className="ops-note" role="status">{saved}</p> : null}

        <h2>Connection</h2>
        <div className="ops-status">
          <span className={report.host ? "ops-badge ok" : "ops-badge bad"}>{report.host ? report.host : "No 3CX host saved"}</span>
          <span className={callControl?.status === "supported_verified" ? "ops-badge ok" : "ops-badge warn"}>
            {callControl?.status === "supported_verified" ? `Call Control accepted${callControl.observed_build ? ` · ${callControl.observed_build}` : ""}` : "Call Control not confirmed"}
          </span>
          <span className={report.listening ? "ops-badge ok" : "ops-badge"}>{report.listening ? "Listening for calls" : "Not listening"}</span>
          <span className={report.switches.master && report.switches.receptionist ? "ops-badge ok" : "ops-badge warn"}>
            {report.switches.master && report.switches.receptionist ? "Receptionist switch on" : "Receptionist switch off"}
          </span>
        </div>
        {report.xapi && !report.xapi.startsWith("Connected") ? <p className="ops-alert" role="alert">{report.xapi} This is the last configuration check. A call still reaches the AI only when 3CX sends it to the Service Principal below.</p> : <p>{report.xapi || "The 3CX connection has not been checked."}</p>}
        {problems.map((problem) => <p className="ops-alert" role="alert" key={problem}>{problem}{problem.startsWith("No realtime") ? <> <Link href="/admin/ai">Open Engines</Link></> : null}</p>)}
        <div className="ops-toolbar">
          <form action={probeCallControlForm}><button className="btn btn-secondary" type="submit">Check Call Control</button></form>
          <form action={startCallControlForm}><button className="btn btn-primary" type="submit">Listen for calls</button></form>
          <form action={stopCallControlForm}><button className="btn btn-secondary" type="submit">Stop listening</button></form>
        </div>
        <p>These buttons do not place a call.</p>

        <h2>Where the call goes</h2>
        <p>{servicePrincipalDirections(report.servicePrincipalId, agents.find((agent) => agent.did)?.did || "")} While Listen for calls is on, SautiCall connects the realtime voice model to that call.</p>
        {agents.filter((agent) => isPhoneExtensionNumber(agent.client_id)).map((agent) => (
          <p className="ops-alert" role="alert" key={agent.id}>{phoneExtensionRouteMessage(agent.client_id, report.servicePrincipalId, agent.did)}</p>
        ))}

        <h2>Receptionists</h2>
        <p>Save the Service Principal name from Integrations, API. Callers dial the phone number in its DID field. Do not paste the secret.</p>
        {agents.length === 0 ? <p>No receptionist is saved.</p> : agents.map((agent) => <Receptionist key={agent.id} agent={agent} servicePrincipalId={report.servicePrincipalId} />)}

        <h2>Recent calls</h2>
        {report.calls.length === 0 ? <p>No telephone call has been recorded.</p> : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Call</th><th>Result</th><th>Caller heard the AI</th></tr></thead>
              <tbody>
                {report.calls.map((call) => (
                  <tr key={call.id}>
                    <td>{call.pbx_call_id}</td>
                    <td>{call.outcome || call.state}</td>
                    <td>{call.media_open === 1 ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Receptionist({ agent, servicePrincipalId }: { agent: VirtualAgent; servicePrincipalId: string }) {
  const native = agent.execution_engine === "THREE_CX_NATIVE";
  const recorded = native ? agent.native_agent_id : agent.client_id;
  const status = receptionistStatus(agent, recorded);
  const replaceExtension = !native && isPhoneExtensionNumber(recorded) && Boolean(servicePrincipalId);
  return (
    <article className="ops-destination">
      <h3>{agent.name}</h3>
      <p>Account {agent.user_id} · {engineLabel(agent.execution_engine)} · {agent.did || "No number"}</p>
      <p><span className={`ops-badge ${status.tone}`}>{status.label}</span></p>
      <form className="ops-toolbar" action={recordVirtualBindingForm}>
        <input type="hidden" name="agent_id" value={agent.id} />
          <label>{native ? "3CX agent id" : "Service Principal name"}
          <input name="resource_id" defaultValue={replaceExtension ? servicePrincipalId : recorded} aria-label={native ? `3CX agent id for ${agent.name}` : `Service Principal name for ${agent.name}`} placeholder={native ? "Agent id from 3CX" : "Name shown as the Service Principal extension"} />
        </label>
        <button className="btn btn-secondary" type="submit">{replaceExtension ? "Use the Service Principal name" : "Save name"}</button>
      </form>
    </article>
  );
}

function receptionistStatus(agent: VirtualAgent, recorded: string) {
  if (agent.status === "PAUSED") return { label: "Paused. Calls stay on the ring group.", tone: "warn" };
  if (agent.binding_status === "ACTIVE" && agent.route_target) return { label: "Certified. The number can route to this receptionist.", tone: "ok" };
  if (isPhoneExtensionNumber(recorded)) return { label: `${recorded} is a user extension. A keypad call to it ends while that user is offline.`, tone: "bad" };
  if (recorded) return { label: "Name saved. Put the phone number in this Service Principal’s DID field, then call that number.", tone: "pending" };
  return { label: "Needs the 3CX Client ID.", tone: "warn" };
}

function savedMessage(saved: string | undefined) {
  if (saved === "probe") return "Checked the existing 3CX connection. No call was placed.";
  if (saved === "listen") return "Listening. Call the phone number in the Service Principal DID field. A keypad cannot dial the Service Principal name.";
  if (saved === "stopped") return "Stopped listening. No call was placed.";
  if (saved) return "Name saved. Call the phone number in the Service Principal DID field.";
  return "";
}

function connectionProblems(report: ReturnType<typeof callControlReport>, callControlStatus: string) {
  const problems: string[] = [];
  if (!report.stored.ready) problems.push("The 3CX connection on this server is empty. Trunks and extensions use that same connection.");
  else if (callControlStatus === "unsupported") problems.push("3CX refused Call Control for the existing Service Principal. In 3CX Admin, open Integrations, then API, and enable Call Control on that principal.");
  else if (callControlStatus !== "supported_verified") problems.push("Call Control has not been confirmed. Use Check Call Control.");
  if (!report.realtime) {
    const names = report.textEngines.length ? report.textEngines.join(", ") : "None";
    problems.push(`No realtime voice model is enabled. Enabled engines: ${names}. Those can draft text. Enable OpenAI Realtime or xAI before a caller can hear the receptionist.`);
  }
  if (!report.switches.master || !report.switches.receptionist) problems.push("Turn on Master AI and AI receptionist. Both switches must be on before a call is answered.");
  return problems;
}
