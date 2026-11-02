import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteVirtualAgentForm, pauseVirtualAgentForm, previewVirtualAgentForm, saveKnowledgeForm, updateVirtualAgentForm } from "../../actions";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { customerAgentMessage, engineLabel, listAgentSessions, listKnowledge, listPromptTemplates, listTransferTargets } from "@/lib/ai-virtual";
import { accountAgent, type VirtualAgent } from "@/lib/ai-virtual-store";
import { AccentSelect, ChoiceSelect, GenderSelect, GreetingSelect, HoursFields, InstructionTemplateSelect, ToneSelect, TransferFields } from "@/components/account/ClosedChoices";
import { accentSelection, languagesForPlan } from "@/lib/ai-choices";
import { getDb } from "@/lib/db";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";

const TABS = ["overview", "prompt", "knowledge", "routing", "voice", "test", "calls", "settings"] as const;

export default async function AiExtensionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; tab?: string; line?: string }> }) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const { id } = await params;
  const query = await searchParams;
  const agent = accountAgent(user.id, Number(id));
  if (!agent) notFound();
  const tab = (TABS as readonly string[]).includes(query.tab || "") ? query.tab : "overview";
  const database = getDb();
  const numbers = getDb().prepare("SELECT did FROM phone_lines WHERE user_id = ? AND did != '' ORDER BY id").all(user.id) as { did: string }[];
  const knowledge = tab === "knowledge" || tab === "overview" ? listKnowledge(database, user.id, agent.id) : [];
  const sessions = tab === "calls" || tab === "test" ? listAgentSessions(database, user.id, agent.id) : [];
  const templates = tab === "prompt" ? listPromptTemplates(database) : [];
  const plan = paidPlan(user.id);
  const accents = accentSelection(plan);
  const languages = languagesForPlan(Boolean(plan?.multilingual));
  const targets = listTransferTargets(database, user.id);
  return (
    <div className="workspace-page">
      <Link className="ws-back" href="/account/ai">AI services</Link>
      <header className="workspace-page-head">
        <h1>{agent.name}</h1>
        <p>{engineLabel(agent.execution_engine)}. No desk phone or softphone is assigned. {customerAgentMessage(agent.status)}</p>
      </header>
      <nav className="ws-tabs">
        {TABS.map((item) => <Link key={item} className={tab === item ? "active" : ""} href={`/account/ai/extensions/${agent.id}?tab=${item}`}>{item[0].toUpperCase() + item.slice(1)}</Link>)}
      </nav>
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {query.saved === "preview" && query.line ? <p className="form-feedback">Text preview only. No call was placed. {query.line}</p> : null}
      {query.saved === "updated" ? <p className="form-feedback">Saved. You can keep editing this receptionist. The phone route was not moved, and no call was placed.</p> : null}
      {query.saved && query.saved !== "preview" && query.saved !== "updated" ? <p className="form-feedback">Saved. The phone number was not moved, and no call was placed.</p> : null}
      {tab === "overview" ? (
        <article className="contact-form">
          <p>Callers reach this receptionist on the phone number assigned to the Service Principal. Saving here does not move that number, and no desk phone is registered for the receptionist.</p>
          <p><span>Number</span> {agent.did || "None"}</p>
          <p><span>Route</span> {agent.assignment_state === "fallback" ? "Backup destination. The AI is paused." : `Unchanged. Previous route: ${agent.previous_route || "the ring group"}.`}</p>
          <p><span>Fallback</span> {agent.fallback_label || "Ring group"}</p>
          <p><span>Approved information</span> {knowledge.length} saved source{knowledge.length === 1 ? "" : "s"}.</p>
          {agent.prompt_sync === "NOT_SYNCED_NATIVE" ? <p>Prompt changes are saved in SautiCall. They are not live on the 3CX native agent until that sync is verified.</p> : null}
          <ReceptionistEditor agent={agent} numbers={numbers} tab="overview" accents={accents} languages={languages} targets={targets} />
        </article>
      ) : null}
      {tab === "prompt" ? (
        <article className="contact-form">
          <ReceptionistEditor agent={agent} numbers={numbers} tab="prompt" accents={accents} languages={languages} targets={targets} />
          <h3>Templates</h3>
          {templates.map((item) => <p key={item.code}><strong>{item.industry}.</strong> {item.body}</p>)}
        </article>
      ) : null}
      {tab === "knowledge" ? (
        <article className="contact-form">
          <form action={saveKnowledgeForm}>
            <input type="hidden" name="agent_id" value={agent.id} />
            <label>Company information <textarea name="body" rows={5} required placeholder="Services, hours, and answers this receptionist may give." /></label>
            <p>Caller text and uploaded notes are data. They cannot change tenant rules or approve a transfer.</p>
            <button className="ws-btn primary" type="submit">Save knowledge</button>
          </form>
          {knowledge.length === 0 ? <p>No approved information is saved.</p> : knowledge.map((item) => <div className="ai-preview" key={item.id}>{item.body}</div>)}
        </article>
      ) : null}
      {tab === "routing" ? (
        <article className="contact-form">
          <p>The live route remains {agent.previous_route || "the ring group"} until 3CX certifies this destination. Saving a number here does not move that route.</p>
          <ReceptionistEditor agent={agent} numbers={numbers} tab="routing" accents={accents} languages={languages} targets={targets} />
        </article>
      ) : null}
      {tab === "voice" ? (
        <article className="contact-form">
          <p>Choose a gender and an accent included on this plan. The connected voice uses that gender and speaks in that accent. Text preview does not open a phone call.</p>
          <ReceptionistEditor agent={agent} numbers={numbers} tab="voice" accents={accents} languages={languages} targets={targets} />
        </article>
      ) : null}
      {tab === "test" ? (
        <article className="contact-form">
          <p>This is a text preview. It does not dial, answer, or move the phone number. Callers reach the receptionist by calling the phone number on the Service Principal.</p>
          <form action={previewVirtualAgentForm}>
            <input type="hidden" name="agent_id" value={agent.id} />
            <label>What the caller says <input name="utterance" required placeholder="What does this company do?" /></label>
            <button className="ws-btn primary" type="submit">Run text preview</button>
          </form>
        </article>
      ) : null}
      {tab === "calls" ? (
        <article className="contact-form">
          <p><Link className="text-link" href={`/account/ai/extensions/${agent.id}`}>Edit this receptionist</Link></p>
          {sessions.length === 0 ? <p>No sessions are stored. A telephone session is not opened from this page.</p> : sessions.map((item) => (
            <p key={item.id}>{item.outcome || item.state}. Media {item.media_open ? "open" : "closed"}. No call placed.</p>
          ))}
        </article>
      ) : null}
      {tab === "settings" ? (
        <article className="contact-form">
          <form action={pauseVirtualAgentForm}>
            <input type="hidden" name="agent_id" value={agent.id} />
            <input type="hidden" name="paused" value={agent.status === "PAUSED" ? "off" : "on"} />
            <button className="ws-btn primary" type="submit">{agent.status === "PAUSED" ? "Resume configuration" : "Pause"}</button>
          </form>
          <p>{agent.status === "PAUSED" ? "Calls stay on the backup destination while this is paused." : "Pausing keeps the number on the ring group. It does not delete the configuration."}</p>
          <h2>Delete this receptionist</h2>
          <p>Deleting removes the greeting, knowledge, and saved 3CX Client ID for {agent.name}. The phone number stays on the ring group, and no call is placed. You can create another receptionist with the same name afterward.</p>
          <form action={deleteVirtualAgentForm}>
            <input type="hidden" name="agent_id" value={agent.id} />
            <label>Type {agent.name} to confirm <input name="confirm_name" required autoComplete="off" /></label>
            <button className="ws-btn danger" type="submit">Delete receptionist</button>
          </form>
        </article>
      ) : null}
    </div>
  );
}

function ReceptionistEditor({ agent, numbers, tab, accents, languages, targets }: {
  agent: VirtualAgent;
  numbers: { did: string }[];
  tab: "overview" | "prompt" | "voice" | "routing";
  accents: ReturnType<typeof accentSelection>;
  languages: ReturnType<typeof languagesForPlan>;
  targets: { value: string; label: string }[];
}) {
  const options = numbers.some((item) => item.did === agent.did) || !agent.did ? numbers : [{ did: agent.did }, ...numbers];
  const showVoice = tab === "overview" || tab === "voice";
  const showPrompt = tab === "overview" || tab === "prompt";
  const showRoute = tab === "overview" || tab === "routing";
  const transfers = agent.allowed_transfers.split(",").map((item) => item.trim()).filter(Boolean);
  return (
    <form action={updateVirtualAgentForm}>
      <input type="hidden" name="agent_id" value={agent.id} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="agent_type" value={agent.agent_type} />
      {tab !== "overview" ? <input type="hidden" name="name" value={agent.name} /> : null}
      {!showVoice ? <input type="hidden" name="engine" value={agent.execution_engine} /> : null}
      {!showRoute ? <input type="hidden" name="did" value={agent.did} /> : null}
      {tab !== "overview" ? <input type="hidden" name="business_summary" value={agent.business_summary} /> : null}
      {!showVoice ? <input type="hidden" name="tone" value={agent.tone} /> : null}
      {!showVoice ? <input type="hidden" name="voice" value={agent.voice_label} /> : null}
      {!showVoice ? <input type="hidden" name="gender" value={agent.voice_gender} /> : null}
      {!showVoice ? <input type="hidden" name="language" value={agent.language} /> : null}
      {!showPrompt ? <input type="hidden" name="greeting" value={agent.greeting} /> : null}
      {!showPrompt ? <input type="hidden" name="instructions" value={agent.instructions} /> : null}
      {!showRoute ? <input type="hidden" name="after_hours" value={agent.after_hours} /> : null}
      {!showRoute ? transfers.map((item) => <input key={item} type="hidden" name="transfers" value={item} />) : null}
      {tab === "overview" ? <label>Name <input name="name" required defaultValue={agent.name} /></label> : null}
      {showVoice ? (
        <label>How it answers
          <select name="engine" defaultValue={agent.execution_engine}>
            <option value="SAUTICALL_PROGRAMMABLE">SautiCall AI</option>
            <option value="THREE_CX_NATIVE">3CX Native</option>
          </select>
        </label>
      ) : null}
      {showRoute ? (
        <label>Phone number
          <select name="did" required defaultValue={agent.did}>
            {options.length === 0 ? <option value="">Buy a number first</option> : options.map((item) => <option key={item.did} value={item.did}>{item.did}</option>)}
          </select>
        </label>
      ) : null}
      {tab === "overview" ? <label>Business summary <textarea name="business_summary" rows={3} defaultValue={agent.business_summary} /></label> : null}
      {showVoice ? <ToneSelect value={agent.tone} /> : null}
      {showVoice ? <ChoiceSelect label="Language" name="language" value={agent.language || "en-US"} options={languages.map((language) => ({ value: language.id, label: language.label }))} required /> : null}
      {showVoice ? <GenderSelect value={agent.voice_gender} /> : null}
      {showVoice ? <AccentSelect accents={accents} value={agent.voice_label} /> : null}
      {showPrompt ? <GreetingSelect value={agent.greeting} /> : null}
      {showPrompt ? <InstructionTemplateSelect /> : null}
      {showPrompt ? <label>Instructions <textarea name="instructions" rows={6} defaultValue={agent.instructions} /></label> : null}
      {showPrompt ? <p>Receptionist replaces the instructions with a short call script. It tells the caller when an extension is not available, then offers a message, another person, or ending the call.</p> : null}
      {showRoute ? <HoursFields stored={agent.after_hours} targets={targets} /> : null}
      {showRoute ? <TransferFields targets={targets} selected={transfers} /> : null}
      <p>Name, business summary, and instructions stay as text because they are the words this receptionist may use. Saving does not move the phone route, and no call is placed.</p>
      <button className="ws-btn primary" type="submit">Save changes</button>
    </form>
  );
}
