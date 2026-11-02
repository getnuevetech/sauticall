import crypto from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createVirtualAgentForm } from "../actions";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { systemsForPlan } from "@/lib/ai-account";
import { customerAgentMessage, engineLabel, listTransferTargets } from "@/lib/ai-virtual";
import { AccentSelect, ChoiceSelect, GenderSelect, GreetingSelect, HoursFields, InstructionTemplateSelect, ToneSelect, TransferFields } from "@/components/account/ClosedChoices";
import { accentSelection, languagesForPlan } from "@/lib/ai-choices";
import { listAccountAgents } from "@/lib/ai-virtual-store";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";
import { getDb } from "@/lib/db";

export default async function AiExtensionsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const choices = systemsForPlan(plan.features).filter((item) => item.included && (item.code === "receptionist" || item.code === "personal_assistant"));
  const agents = listAccountAgents(user.id);
  const numbers = getDb().prepare("SELECT did FROM phone_lines WHERE user_id = ? AND did != '' ORDER BY id").all(user.id) as { did: string }[];
  const accents = accentSelection(plan);
  const languages = languagesForPlan(Boolean(plan.multilingual));
  const targets = listTransferTargets(getDb(), user.id);
  const requestId = crypto.randomUUID();
  return (
    <div className="workspace-page">
      <Link className="ws-back" href="/account/ai">AI services</Link>
      <header className="workspace-page-head">
        <h1>AI extensions</h1>
        <p>An AI extension is a virtual destination on the phone system. It does not use a desk phone or a softphone. The phone number stays on the Main ring group until 3CX certifies the destination.</p>
      </header>
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {agents.length === 0 ? <p>No AI extension is saved yet.</p> : agents.map((agent) => (
        <article className="ai-row" key={agent.id}>
          <div>
            <h3>{agent.name}</h3>
            <p>{engineLabel(agent.execution_engine)} · {agent.did || "No number selected"}</p>
            <p>{customerAgentMessage(agent.status)}</p>
          </div>
          <div className="ai-form-actions">
            <Link className="ws-btn primary" href={`/account/ai/extensions/${agent.id}`}>Open</Link>
            <Link className="ws-btn ghost" href={`/account/ai/extensions/${agent.id}?tab=settings`}>Delete</Link>
          </div>
        </article>
      ))}
      {choices.length === 0 ? <p>This plan does not include an AI receptionist or personal assistant.</p> : (
        <form className="contact-form" action={createVirtualAgentForm}>
          <h2>Create an AI extension</h2>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="next" value="/account/ai/extensions" />
          <label>Name <input name="name" required placeholder="Front desk" /></label>
          <label>Purpose
            <select name="agent_type" defaultValue={choices[0]?.code || "receptionist"}>
              {choices.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label>How it answers
            <select name="engine" defaultValue="SAUTICALL_PROGRAMMABLE">
              <option value="SAUTICALL_PROGRAMMABLE">SautiCall AI</option>
              <option value="THREE_CX_NATIVE">3CX Native</option>
            </select>
          </label>
          <p>SautiCall AI uses the prompts saved here through the 3CX connection that already provisions trunks and extensions. 3CX Native keeps prompt changes here until 3CX confirms them. Neither choice assigns a phone.</p>
          <label>Phone number
            <select name="did" required defaultValue={numbers[0]?.did || ""}>
              {numbers.length === 0 ? <option value="">Buy a number first</option> : numbers.map((item) => <option key={item.did} value={item.did}>{item.did}</option>)}
            </select>
          </label>
          <ToneSelect value="professional" />
          <ChoiceSelect label="Language" name="language" value={languages[0]?.id || "en-US"} options={languages.map((language) => ({ value: language.id, label: language.label }))} required />
          <GenderSelect value="neutral" />
          <AccentSelect accents={accents} value={accents[0]?.id || ""} />
          <GreetingSelect value="" />
          <InstructionTemplateSelect />
          <label>Instructions <textarea name="instructions" rows={6} placeholder="Questions to ask, and answers this receptionist may give." /></label>
          <HoursFields stored="" targets={targets} />
          <TransferFields targets={targets} selected={[]} />
          <p>A virtual AI endpoint will be prepared. No phone hardware is needed. Saving this does not move the live route and does not place a call.</p>
          <button className="ws-btn primary" type="submit" disabled={numbers.length === 0}>Save AI extension</button>
        </form>
      )}
    </div>
  );
}
