import crypto from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createVirtualAgentForm } from "./actions";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { systemsForPlan } from "@/lib/ai-account";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { listAccountAgents } from "@/lib/ai-virtual-store";
import { AI_PLAN_FEATURE, activationState, featureReady } from "@/lib/ai-system";
import { acceptedVersion, currentAgreement, enabledSwitchCodes, entitlementFor } from "@/lib/ai-store";
import { aiSaveNotice, nextSetupStep, switchCodeFor, workspaceProfile, type SetupFacts } from "@/lib/ai-workspace";
import { getDb } from "@/lib/db";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

const BLOCKED = new Set(["pending_terms", "pending_review", "ready_to_request", "off_global", "suspended"]);

export default async function AccountAiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const systems = systemsForPlan(plan.features);
  const agents = listAccountAgents(user.id);
  const numbers = getDb().prepare("SELECT did FROM phone_lines WHERE user_id = ? AND did != '' ORDER BY id").all(user.id) as { did: string }[];
  const enabled = enabledSwitchCodes();
  const notice = aiSaveNotice(query.saved);
  const virtualChoices = systems.filter((item) => item.included && workspaceProfile(item.code).virtualDestination);
  const cards = systems.map((system) => {
    const code = switchCodeFor(system.code);
    const agreement = code ? currentAgreement(code) : undefined;
    const ent = code ? entitlementFor(user.id, code) : undefined;
    const state = code && ent ? activationState({
      globalOn: featureReady(enabled, code),
      planIncludes: planAllows(plan, AI_PLAN_FEATURE[code]),
      publishedVersion: agreement?.version || 0,
      acceptedVersion: acceptedVersion(user.id, code),
      grant: ent.grant,
      customerEnabled: ent.customerEnabled,
      reviewRequired: code === "notifications",
    }) : null;
    const facts: SetupFacts = {
      included: system.included,
      named: agents.some((item) => item.agent_type === system.code),
      hasInstructions: agents.some((item) => item.agent_type === system.code && item.instructions.trim()),
      extensionAssigned: agents.some((item) => item.agent_type === system.code),
      serviceOn: state?.code === "active",
      termsOpen: Boolean(state && BLOCKED.has(state.code)),
    };
    return { system, step: nextSetupStep(system.code, facts, plan.name), virtual: workspaceProfile(system.code).virtualDestination };
  });
  const other = cards.filter((item) => !item.virtual);
  const requestId = crypto.randomUUID();
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>AI services</h1>
        <p>The receptionist is configured here. It is a virtual destination on 3CX, not a person and not a phone extension.</p>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      <section id="configure">
        <h2>How an AI extension answers</h2>
        <ol>
          <li>You save the name, greeting, business instructions, phone number, and answering mode on this page.</li>
          <li>SautiCall AI uses those instructions through a programmable route on 3CX. 3CX Native is created in 3CX, and the prompt stays here until 3CX confirms it.</li>
          <li>No desk phone or softphone is assigned. A normal extension is not created for the receptionist.</li>
          <li>The phone number keeps ringing the Main ring group. Saving this configuration does not move that route and does not place a call.</li>
          <li>An internal call reaches the receptionist by dialing the existing 3CX Service Principal Client ID. The phone number stays on the ring group until that route is confirmed. This page does not place a call.</li>
        </ol>
        {virtualChoices.length === 0 ? (
          <p>This plan does not include an AI receptionist. <Link className="text-link" href="/account/billing/plan">See plans</Link></p>
        ) : (
          <>
            {agents.length === 0 ? <p>No AI extension is configured yet.</p> : agents.map((agent) => (
              <article className="ai-row" key={agent.id}>
                <div>
                  <h3>{agent.name}</h3>
                  <p>{engineLabel(agent.execution_engine)} · {agent.did || "No number selected"}</p>
                  <p>{customerAgentMessage(agent.status)}</p>
                  <p>{agent.greeting || "No greeting saved yet."}</p>
                </div>
                <div className="ai-form-actions">
                  <Link className="ws-btn ghost" href={`/account/ai/extensions/${agent.id}`}>Edit</Link>
                  <Link className="ws-btn ghost" href={`/account/ai/extensions/${agent.id}?tab=settings`}>Delete</Link>
                </div>
              </article>
            ))}
            <form className="contact-form" action={createVirtualAgentForm}>
              <h2>Configure the AI extension</h2>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="next" value="/account/ai" />
              <label>Name <input name="name" required placeholder="Front desk" /></label>
              <label>Purpose
                <select name="agent_type" defaultValue={virtualChoices[0]?.code || "receptionist"}>
                  {virtualChoices.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
              <label>How it answers
                <select name="engine" defaultValue="SAUTICALL_PROGRAMMABLE">
                  <option value="SAUTICALL_PROGRAMMABLE">SautiCall AI</option>
                  <option value="THREE_CX_NATIVE">3CX Native</option>
                </select>
              </label>
              <label>Phone number
                <select name="did" required defaultValue={numbers[0]?.did || ""}>
                  {numbers.length === 0 ? <option value="">Buy a number first</option> : numbers.map((item) => <option key={item.did} value={item.did}>{item.did}</option>)}
                </select>
              </label>
              <label>Business summary <textarea name="business_summary" rows={3} placeholder="What this company does, in words the receptionist may repeat." /></label>
              <label>Tone <input name="tone" placeholder="Professional and brief" /></label>
              <label>Voice <input name="voice" placeholder="Clear English" /></label>
              <label>Greeting <input name="greeting" placeholder="Thank you for calling. How can I help you today?" /></label>
              <label>Instructions <textarea name="instructions" rows={6} placeholder="Business hours, questions to ask, and who a caller may reach." /></label>
              <label>After hours <input name="after_hours" placeholder="Take a message" /></label>
              <label>Approved transfers <input name="transfers" placeholder="516, Main" /></label>
              <p>Saving prepares the virtual destination. The live number stays on the ring group until 3CX certifies it.</p>
              <button className="ws-btn primary" type="submit" disabled={numbers.length === 0}>Save configuration</button>
            </form>
          </>
        )}
      </section>
      {other.length > 0 ? (
        <section>
          <h2>Other AI systems</h2>
          <ul className="ai-compact">
            {other.map(({ system, step }) => (
              <li key={system.code}>
                <span><strong>{system.label}</strong> {step.summary}</span>
                <Link className="text-link" href={step.href}>{step.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
