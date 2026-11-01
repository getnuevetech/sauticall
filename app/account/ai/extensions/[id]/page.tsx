import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pauseVirtualAgentForm, previewVirtualAgentForm, saveKnowledgeForm } from "../../actions";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { customerAgentMessage, engineLabel } from "@/lib/ai-virtual";
import { accountAgent } from "@/lib/ai-virtual-store";
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
  const knowledge = tab === "knowledge" || tab === "overview" ? listKnowledge(database, user.id, agent.id) : [];
  const sessions = tab === "calls" || tab === "test" ? listAgentSessions(database, user.id, agent.id) : [];
  const templates = tab === "prompt" ? listPromptTemplates(database) : [];
  const here = `/account/ai/extensions/${agent.id}?tab=${tab}`;
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
      {query.saved && query.saved !== "preview" ? <p className="form-feedback">Saved. The phone number was not moved, and no call was placed.</p> : null}
      {tab === "overview" ? (
        <article className="contact-form">
          <p>Live answering is blocked until 3CX confirms a programmable route that can carry audio. Until then, this number stays on the ring group.</p>
          <p><span>Number</span> {agent.did || "None"}</p>
          <p><span>Route</span> {agent.assignment_state === "fallback" ? "Backup destination. The AI is paused." : `Unchanged. Previous route: ${agent.previous_route || "the ring group"}.`}</p>
          <p><span>Fallback</span> {agent.fallback_label || "Ring group"}</p>
          <p><span>Approved information</span> {knowledge.length} saved source{knowledge.length === 1 ? "" : "s"}.</p>
          {agent.prompt_sync === "NOT_SYNCED_NATIVE" ? <p>Prompt changes are saved in SautiCall. They are not live on the 3CX native agent until that sync is verified.</p> : null}
        </article>
      ) : null}
      {tab === "prompt" ? (
        <article className="contact-form">
          <p>{agent.greeting || "No greeting saved yet."}</p>
          <div className="ai-preview">{agent.instructions || "No instructions saved yet."}</div>
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
          <p>The selected number is {agent.did || "not chosen"}. The live route remains {agent.previous_route || "the ring group"} until 3CX certifies this destination.</p>
          <p>After hours: the backup destination stays in use. A transfer is allowed only when it is one of this account&apos;s saved destinations.</p>
          <p><Link className="text-link" href={here}>Routing is not changed from this tab.</Link></p>
        </article>
      ) : null}
      {tab === "voice" ? (
        <article className="contact-form">
          <p>Answering mode: {engineLabel(agent.execution_engine)}.</p>
          <p>A voice is not played on a live call until the 3CX media path is confirmed. Text preview does not open a phone call.</p>
        </article>
      ) : null}
      {tab === "test" ? (
        <article className="contact-form">
          <p>This is a text preview. It does not dial, answer, or move the phone number. A live test call waits on a confirmed 3CX programmable route.</p>
          <form action={previewVirtualAgentForm}>
            <input type="hidden" name="agent_id" value={agent.id} />
            <label>What the caller says <input name="utterance" required placeholder="What does this company do?" /></label>
            <button className="ws-btn primary" type="submit">Run text preview</button>
          </form>
        </article>
      ) : null}
      {tab === "calls" ? (
        <article className="contact-form">
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
        </article>
      ) : null}
    </div>
  );
}
