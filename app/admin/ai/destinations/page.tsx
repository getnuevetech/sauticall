import Link from "next/link";
import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { engineLabel } from "@/lib/ai-virtual";
import { listAllAgents, type VirtualAgent } from "@/lib/ai-virtual-store";
import { callControlReport } from "@/lib/call-control-service";
import { isPhoneExtensionNumber, phoneExtensionRouteMessage } from "@/lib/call-control-plan";
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
        {report.servicePrincipalId ? (
          <>
            <p>SautiCall listens as Service Principal <strong>{report.servicePrincipalId}</strong>. That Client ID is the route point. It is not a desk phone, so it does not go offline.</p>
            <p>From a registered extension, dial <strong>{report.servicePrincipalId}</strong>. 3CX gives that call’s audio to SautiCall, and the realtime voice model speaks back on the same call.</p>
            <p>For the outside number, open 3CX Admin, then Integrations, then API, select this Service Principal, and assign the number there. Do not send it to a normal extension. A normal extension stays offline until a phone registers, and 3CX ends the call before SautiCall sees it.</p>
          </>
        ) : <p>The saved 3CX connection has no Service Principal Client ID, so there is no route point to dial.</p>}
        {agents.filter((agent) => isPhoneExtensionNumber(agent.client_id)).map((agent) => (
          <p className="ops-alert" role="alert" key={agent.id}>{phoneExtensionRouteMessage(agent.client_id, report.servicePrincipalId)}</p>
        ))}

        <h2>Receptionists</h2>
        <p>Save the Service Principal Client ID shown above. Do not paste a phone extension number, and do not paste the secret.</p>
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
        <label>{native ? "3CX agent id" : "Service Principal Client ID"}
          <input name="resource_id" defaultValue={replaceExtension ? servicePrincipalId : recorded} aria-label={native ? `3CX agent id for ${agent.name}` : `Service Principal Client ID for ${agent.name}`} placeholder={native ? "Agent id from 3CX" : "Client ID from 3CX Integrations, API"} />
        </label>
        <button className="btn btn-secondary" type="submit">{replaceExtension ? "Use the Service Principal" : "Save Client ID"}</button>
      </form>
    </article>
  );
}

function receptionistStatus(agent: VirtualAgent, recorded: string) {
  if (agent.status === "PAUSED") return { label: "Paused. Calls stay on the ring group.", tone: "warn" };
  if (agent.binding_status === "ACTIVE" && agent.route_target) return { label: "Certified. The number can route to this receptionist.", tone: "ok" };
  if (isPhoneExtensionNumber(recorded)) return { label: `${recorded} is an offline phone extension. Calls end before the AI answers.`, tone: "bad" };
  if (recorded) return { label: "Client ID saved. Assign the outside number to this Service Principal in 3CX.", tone: "pending" };
  return { label: "Needs the 3CX Client ID.", tone: "warn" };
}

function savedMessage(saved: string | undefined) {
  if (saved === "probe") return "Checked the existing 3CX connection. No call was placed.";
  if (saved === "listen") return "Listening. From a registered extension, dial the Service Principal Client ID on this page. A normal extension stays offline, and 3CX ends that call.";
  if (saved === "stopped") return "Stopped listening. No call was placed.";
  if (saved) return "Client ID saved. Calls still ring the group.";
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
