import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { accountAgent } from "@/lib/ai-virtual-store";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";

export default async function AiExtensionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const { id } = await params;
  const query = await searchParams;
  const agent = accountAgent(user.id, Number(id));
  if (!agent) notFound();
  return (
    <div className="workspace-page">
      <Link className="ws-back" href="/account/ai/extensions">AI extensions</Link>
      <header className="workspace-page-head">
        <h1>{agent.name}</h1>
        <p>{engineLabel(agent.execution_engine)}. No desk phone or softphone is assigned to this destination.</p>
      </header>
      {query.saved ? <p className="form-feedback">{customerAgentMessage(agent.status)} No call was placed.</p> : null}
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      <article className="contact-form">
        <p><span>Status</span> {customerAgentMessage(agent.status)}</p>
        <p><span>Number</span> {agent.did || "None"}</p>
        <p><span>Current route</span> {agent.assignment_state === "held" ? `Unchanged. Previous route: ${agent.previous_route || "the ring group"}.` : "Not published."}</p>
        <p><span>Fallback</span> {agent.fallback_label || "Ring group"}</p>
        {agent.prompt_sync === "NOT_SYNCED_NATIVE" ? <p>Prompt changes are saved in SautiCall. They are not live on the 3CX native agent until that sync is verified.</p> : null}
        {agent.greeting ? <p><span>Greeting</span> {agent.greeting}</p> : null}
        {agent.instructions ? <div className="ai-preview">{agent.instructions}</div> : <p>No extra instructions are saved.</p>}
        <p>This page does not place a call. A live test is required before this destination can be marked active, and that test is not available until 3CX confirms the route.</p>
      </article>
    </div>
  );
}
