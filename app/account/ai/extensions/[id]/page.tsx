import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteVirtualAgentForm, pauseVirtualAgentForm, previewVirtualAgentForm, saveKnowledgeForm, updateVirtualAgentForm } from "../../actions";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { accountAgent, type VirtualAgent } from "@/lib/ai-virtual-store";
import { getDb } from "@/lib/db";
import { listAgentSessions, listKnowledge, listPromptTemplates } from "@/lib/ai-virtual";
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
          <p>This number stays on the ring group. An internal test dials the existing 3CX Service Principal Client ID. No desk phone is registered for the receptionist.</p>
          <p><span>Number</span> {agent.did || "None"}</p>
          <p><span>Route</span> {agent.assignment_state === "fallback" ? "Backup destination. The AI is paused." : `Unchanged. Previous route: ${agent.previous_route || "the ring group"}.`}</p>
          <p><span>Fallback</span> {agent.fallback_label || "Ring group"}</p>
          <p><span>Approved information</span> {knowledge.length} saved source{knowledge.length === 1 ? "" : "s"}.</p>
          {agent.prompt_sync === "NOT_SYNCED_NATIVE" ? <p>Prompt changes are saved in SautiCall. They are not live on the 3CX native agent until that sync is verified.</p> : null}
          <ReceptionistEditor agent={agent} numbers={numbers} tab="overview" />
        </article>
      ) : null}
      {tab === "prompt" ? (
        <article className="contact-form">
          <ReceptionistEditor agent={agent} numbers={numbers} tab="prompt" />
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
          <ReceptionistEditor agent={agent} numbers={numbers} tab="routing" />
        </article>
      ) : null}
      {tab === "voice" ? (
        <article className="contact-form">
          <p>The saved voice is used when the existing 3CX connection is carrying live audio. Text preview does not open a phone call.</p>
          <ReceptionistEditor agent={agent} numbers={numbers} tab="voice" />
        </article>
      ) : null}
      {tab === "test" ? (
        <article className="contact-form">
          <p>This is a text preview. It does not dial, answer, or move the phone number. A live test is an internal call to the existing Service Principal.</p>
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

function ReceptionistEditor({ agent, numbers, tab }: { agent: VirtualAgent; numbers: { did: string }[]; tab: "overview" | "prompt" | "voice" | "routing" }) {
  const options = numbers.some((item) => item.did === agent.did) || !agent.did ? numbers : [{ did: agent.did }, ...numbers];
  return (
    <form action={updateVirtualAgentForm}>
      <input type="hidden" name="agent_id" value={agent.id} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="agent_type" value={agent.agent_type} />
      {tab !== "overview" ? <input type="hidden" name="name" value={agent.name} /> : null}
      {tab !== "overview" && tab !== "voice" ? <input type="hidden" name="engine" value={agent.execution_engine} /> : null}
      {tab !== "overview" && tab !== "routing" ? <input type="hidden" name="did" value={agent.did} /> : null}
      {tab !== "overview" ? <input type="hidden" name="business_summary" value={agent.business_summary} /> : null}
      {tab !== "overview" && tab !== "voice" ? <input type="hidden" name="tone" value={agent.tone} /> : null}
      {tab !== "overview" && tab !== "voice" ? <input type="hidden" name="voice" value={agent.voice_label} /> : null}
      {tab !== "overview" && tab !== "prompt" ? <input type="hidden" name="greeting" value={agent.greeting} /> : null}
      {tab !== "overview" && tab !== "prompt" ? <input type="hidden" name="instructions" value={agent.instructions} /> : null}
      {tab !== "overview" && tab !== "routing" ? <input type="hidden" name="after_hours" value={agent.after_hours} /> : null}
      {tab !== "overview" && tab !== "routing" ? <input type="hidden" name="transfers" value={agent.allowed_transfers} /> : null}
      {tab === "overview" ? <label>Name <input name="name" required defaultValue={agent.name} /></label> : null}
      {tab === "overview" || tab === "voice" ? (
        <label>How it answers
          <select name="engine" defaultValue={agent.execution_engine}>
            <option value="SAUTICALL_PROGRAMMABLE">SautiCall AI</option>
            <option value="THREE_CX_NATIVE">3CX Native</option>
          </select>
        </label>
      ) : null}
      {tab === "overview" || tab === "routing" ? (
        <label>Phone number
          <select name="did" required defaultValue={agent.did}>
            {options.length === 0 ? <option value="">Buy a number first</option> : options.map((item) => <option key={item.did} value={item.did}>{item.did}</option>)}
          </select>
        </label>
      ) : null}
      {tab === "overview" ? <label>Business summary <textarea name="business_summary" rows={3} defaultValue={agent.business_summary} /></label> : null}
      {tab === "overview" || tab === "voice" ? <label>Tone <input name="tone" defaultValue={agent.tone} /></label> : null}
      {tab === "overview" || tab === "voice" ? <label>Voice <input name="voice" defaultValue={agent.voice_label} /></label> : null}
      {tab === "overview" || tab === "prompt" ? <label>Greeting <input name="greeting" defaultValue={agent.greeting} /></label> : null}
      {tab === "overview" || tab === "prompt" ? <label>Instructions <textarea name="instructions" rows={6} defaultValue={agent.instructions} /></label> : null}
      {tab === "overview" || tab === "routing" ? <label>After hours <input name="after_hours" defaultValue={agent.after_hours} /></label> : null}
      {tab === "overview" || tab === "routing" ? <label>Approved transfers <input name="transfers" defaultValue={agent.allowed_transfers} placeholder="516, Main" /></label> : null}
      <p>Saving updates this receptionist. The phone route stays where it is, and no call is placed.</p>
      <button className="ws-btn primary" type="submit">Save changes</button>
    </form>
  );
}
