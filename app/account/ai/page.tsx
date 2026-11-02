import Link from "next/link";
import { redirect } from "next/navigation";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { ACCOUNT_AI_SYSTEMS, systemsForPlan } from "@/lib/ai-account";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { listAccountAgents, type VirtualAgent } from "@/lib/ai-virtual-store";
import { workspaceProfile } from "@/lib/ai-workspace";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";

export default async function AccountAiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const systems = systemsForPlan(plan.features);
  const agents = listAccountAgents(user.id);
  const virtual = systems.filter((item) => item.included && workspaceProfile(item.code).virtualDestination);
  const other = systems.filter((item) => !workspaceProfile(item.code).virtualDestination);
  const lead = agents[0];
  const route = lead ? routeFacts(lead) : null;
  return (
    <div className="workspace-page ai-studio">
      <p className="ai-kicker"><strong>{plan.name}</strong> · <Link href="/account/billing/plan">View plan options</Link></p>
      <header className="workspace-page-head">
        <h1>AI services overview</h1>
        <p>Manage your AI assistants and their setup. A receptionist is a virtual destination, not a phone extension.</p>
      </header>
      {query.saved ? <p className="form-feedback">Saved. The live route was not moved, and no call was placed.</p> : null}
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      <div className="ai-studio-grid" id="configure">
        <section className="ai-card">
          <div className="ai-card-head">
            <h2>My assistants</h2>
            {virtual.length > 0 ? <Link className="ws-btn primary" href="/account/ai/extensions">Add assistant</Link> : null}
          </div>
          {virtual.length === 0 ? <p>This plan does not include an AI receptionist. <Link className="text-link" href="/account/billing/plan">View plan options</Link></p> : agents.length === 0 ? <p>No assistant is configured yet.</p> : (
            <table className="ai-table">
              <thead>
                <tr><th>Assistant</th><th>Purpose</th><th>Answering mode</th><th>Number</th><th>Readiness</th><th>Action</th></tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const ready = readiness(agent);
                  return (
                    <tr key={agent.id}>
                      <td className="ai-person"><strong>{agent.name}</strong><small>{typeLabel(agent.agent_type)}</small></td>
                      <td>{typeLabel(agent.agent_type)}</td>
                      <td>{engineLabel(agent.execution_engine)}</td>
                      <td>{formatDid(agent.did)}</td>
                      <td><span className={`ai-status ${ready.tone}`}><i />{ready.label}</span></td>
                      <td><Link className="ws-btn ghost" href={`/account/ai/extensions/${agent.id}`}>Manage</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {lead ? <p className="ai-note">{statusLine(lead)}</p> : null}
        </section>
        <aside className="ai-card">
          <h2>Routing status</h2>
          <p>This shows the current live route and the proposed change.</p>
          {route ? (
            <>
              <div className="ai-route-line"><div><span>Current destination</span><strong>{route.current}</strong><small>{route.currentDetail}</small></div></div>
              <div className="ai-route-line"><div><span>Proposed destination</span><strong>{route.proposed}</strong><small>{route.proposedDetail}</small></div></div>
              <div className="ai-route-line"><div><span>Phone-system confirmation</span><strong className={`ai-status ${route.confirmed ? "ok" : "warn"}`}><i />{route.confirmed ? "Confirmed" : "Pending"}</strong></div></div>
              <div className="ai-route-line"><div><span>Live route</span><strong>{route.live}</strong></div></div>
            </>
          ) : <p>No virtual destination is saved. Calls stay on the ring group.</p>}
          <Link className="ws-btn primary" href={lead ? `/account/ai/extensions/${lead.id}?tab=configuration` : "/account/ai/extensions"}>Complete setup</Link>
          <details>
            <summary>How setup works</summary>
            <p>Saving stores the name, greeting, instructions, number, and answering mode. It does not move the phone number and does not place a call. Callers keep reaching the current route until 3CX confirms the virtual destination.</p>
          </details>
        </aside>
      </div>
      <section>
        <h2>Other AI services</h2>
        <div className="ai-service-grid">
          {other.map((system) => (
            <article className="ai-service" key={system.code}>
              <div>
                <h3>{system.label}</h3>
                <p>{system.detail}</p>
                <Link className="text-link" href={system.included ? `/account/ai/services/${system.code}` : "/account/billing/plan"}>{system.included ? "Open" : "View plan options"}</Link>
              </div>
              {system.included ? null : <span className="ai-pill">Not included</span>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function typeLabel(code: string) {
  return ACCOUNT_AI_SYSTEMS.find((item) => item.code === code)?.label || "AI receptionist";
}

function formatDid(did: string) {
  const digits = did.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return did || "No number";
}

function statusLine(agent: VirtualAgent) {
  const confirmed = agent.binding_status === "ACTIVE" && Boolean(agent.route_target);
  if (agent.status === "ACTIVE" && !confirmed) return customerAgentMessage("AWAITING_READBACK");
  return customerAgentMessage(agent.status);
}

function readiness(agent: VirtualAgent) {
  const confirmed = agent.binding_status === "ACTIVE" && Boolean(agent.route_target);
  if (confirmed && agent.status === "ACTIVE") return { label: "Confirmed", tone: "ok" };
  if (agent.status === "PAUSED" || agent.status === "DISABLED") return { label: "Paused", tone: "warn" };
  if (agent.status === "FAILED_RETRYABLE" || agent.status === "FAILED_TERMINAL") return { label: "Not activated", tone: "warn" };
  if (!agent.did || !agent.name) return { label: "Incomplete", tone: "warn" };
  return { label: "Awaiting confirmation", tone: "warn" };
}

function routeFacts(agent: VirtualAgent) {
  const confirmed = agent.binding_status === "ACTIVE" && Boolean(agent.route_target);
  const current = agent.assignment_state === "fallback"
    ? (agent.fallback_label || "Backup destination")
    : (agent.previous_route || agent.fallback_label || "Main ring group");
  return {
    current,
    currentDetail: confirmed ? "3CX confirmed this destination." : `Calls to ${formatDid(agent.did)} continue on this route until a verified change succeeds.`,
    proposed: `${agent.name} virtual destination`,
    proposedDetail: confirmed ? "This destination is confirmed." : "Confirmation pending. Saving does not switch the live route.",
    confirmed,
    live: confirmed ? agent.route_target : "Unchanged",
  };
}
