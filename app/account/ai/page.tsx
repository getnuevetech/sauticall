import Link from "next/link";
import { redirect } from "next/navigation";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { guardAccount } from "@/lib/guard";
import { systemsForPlan } from "@/lib/ai-account";
import { aiSettingsFor, listAiExtensions } from "@/lib/ai-account-store";
import { listAccountAgents } from "@/lib/ai-virtual-store";
import { AI_PLAN_FEATURE, activationState, featureReady } from "@/lib/ai-system";
import { acceptedVersion, currentAgreement, enabledSwitchCodes, entitlementFor } from "@/lib/ai-store";
import { aiSaveNotice, nextSetupStep, switchCodeFor, workspaceProfile, type SetupFacts } from "@/lib/ai-workspace";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

const BLOCKED = new Set(["pending_terms", "pending_review", "ready_to_request", "off_global", "suspended"]);

export default async function AccountAiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const systems = systemsForPlan(plan?.features || []);
  const extensions = listAiExtensions(user.id);
  const agents = listAccountAgents(user.id);
  const enabled = enabledSwitchCodes();
  const notice = aiSaveNotice(query.saved);
  const cards = systems.map((system) => {
    const settings = aiSettingsFor(user.id, system.code);
    const virtual = workspaceProfile(system.code).virtualDestination;
    const phoneAssigned = extensions.find((item) => item.ai_role === system.code);
    const virtualAssigned = agents.some((item) => item.agent_type === system.code);
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
      named: Boolean(settings?.display_name || phoneAssigned?.ai_name || (virtual && virtualAssigned)),
      hasInstructions: Boolean(settings?.greeting.trim()),
      extensionAssigned: virtual ? virtualAssigned : Boolean(phoneAssigned),
      serviceOn: state?.code === "active",
      termsOpen: Boolean(state && BLOCKED.has(state.code)),
    };
    return { system, step: nextSetupStep(system.code, facts, plan?.name || "") };
  });
  const included = cards.filter((item) => item.system.included);
  const closed = cards.filter((item) => !item.system.included);
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>AI services</h1>
        <p>{plan ? `${plan.name} includes ${included.length} of ${systems.length} AI systems.` : "Choose a plan before an AI system can be configured."} AI extensions are virtual destinations. They are created here, not as phone-system users. Calls stay on the ring group until 3CX certifies the destination.</p>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {included.length > 0 ? (
        <section className="ai-included">
          <h2>On this plan</h2>
          {included.map(({ system, step }) => (
            <article className="ai-row" key={system.code}>
              <div>
                <h3>{system.label}</h3>
                <p>{system.detail}</p>
                <p>{step.summary}</p>
              </div>
              <Link className="ws-btn primary" href={step.href}>{step.label}</Link>
            </article>
          ))}
        </section>
      ) : <p>No AI system is included on this plan.</p>}
      {closed.length > 0 ? (
        <section>
          <h2>Other AI systems</h2>
          <ul className="ai-compact">
            {closed.map(({ system, step }) => (
              <li key={system.code}>
                <span><strong>{system.label}</strong> {step.summary}</span>
                <Link className="text-link" href={step.href}>{step.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p><Link className="text-link" href="/account/ai/extensions">AI extensions</Link> hold the name, prompt, and phone number for a receptionist or personal assistant. No desk phone or softphone is assigned.</p>
    </div>
  );
}
