import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteVirtualAgentForm, pauseVirtualAgentForm, previewVirtualAgentForm, saveKnowledgeForm, updateVirtualAgentForm } from "../../actions";
import { AfterHoursFields } from "@/components/account/AfterHoursFields";
import { PromptStudio } from "@/components/account/PromptStudio";
import { TransferPicker } from "@/components/account/TransferPicker";
import { AccentSelect, ChoiceSelect, GreetingSelect, ToneSelect } from "@/components/account/ClosedChoices";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { ACCOUNT_AI_SYSTEMS, systemsForPlan } from "@/lib/ai-account";
import { GENDERS, OFFICE_TIMES, PROMPT_TEMPLATES, accentSelection, greetingText, languagesForPlan, officeTimeLabel, readOfficeHours } from "@/lib/ai-choices";
import { BUSINESS_SUMMARY_MAX, INSTRUCTION_TOKENS, customerAgentMessage, engineLabel, listAgentSessions, listKnowledge, listTransferTargets } from "@/lib/ai-virtual";
import { accountAgent, type VirtualAgent } from "@/lib/ai-virtual-store";
import { INSTRUCTION_MAX, workspaceProfile } from "@/lib/ai-workspace";
import { getDb } from "@/lib/db";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "prompt", label: "Prompt & instructions" },
  { id: "configuration", label: "Configuration" },
  { id: "activity", label: "Activity" },
] as const;

export default async function AiExtensionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; tab?: string; line?: string }> }) {
  const user = await guardAccount();
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const { id } = await params;
  const query = await searchParams;
  const agent = accountAgent(user.id, Number(id));
  if (!agent) notFound();
  const view = editorView(query.tab);
  const database = getDb();
  const numbers = database.prepare("SELECT did FROM phone_lines WHERE user_id = ? AND did != '' ORDER BY id").all(user.id) as { did: string }[];
  const targets = listTransferTargets(database, user.id);
  const accents = accentSelection(plan);
  const languages = languagesForPlan(Boolean(plan.multilingual));
  const purposes = systemsForPlan(plan.features).filter((item) => item.included && workspaceProfile(item.code).virtualDestination);
  const knowledge = view === "activity" || view === "overview" ? listKnowledge(database, user.id, agent.id) : [];
  const sessions = view === "activity" ? listAgentSessions(database, user.id, agent.id) : [];
  const route = routeFacts(agent);
  const ready = readiness(agent);
  const href = (tab: string) => `/account/ai/extensions/${agent.id}?tab=${tab}`;
  return (
    <div className="workspace-page ai-studio">
      <Link className="ws-back" href="/account/ai">AI services</Link>
      <header className="workspace-page-head">
        <div className="ai-title-row">
          <h1>{agent.name}</h1>
          <span className="ai-badge">{typeLabel(agent.agent_type)}</span>
        </div>
        <p>{statusLine(agent)} No desk phone or softphone is assigned.</p>
      </header>
      <nav className="ws-tabs">
        {NAV.map((item) => <Link key={item.id} className={(view === item.id || (item.id === "configuration" && view === "hours")) ? "active" : ""} href={href(item.id)}>{item.label}</Link>)}
      </nav>
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {query.saved === "preview" && query.line ? <p className="form-feedback">Text preview only. No call was placed. {query.line}</p> : null}
      {query.saved && query.saved !== "preview" ? <p className="form-feedback">Saved. The phone route was not moved, and no call was placed.</p> : null}
      {view === "overview" ? <Overview agent={agent} route={route} ready={ready} /> : null}
      {view === "prompt" ? <Prompt agent={agent} route={route} ready={ready} /> : null}
      {view === "configuration" || view === "hours" ? (
        <Config agent={agent} view={view} numbers={numbers} accents={accents} languages={languages} purposes={purposes} targets={targets} route={route} href={href} />
      ) : null}
      {view === "activity" ? <Activity agent={agent} knowledge={knowledge} sessions={sessions} /> : null}
    </div>
  );
}

function Overview({ agent, route, ready }: { agent: VirtualAgent; route: ReturnType<typeof routeFacts>; ready: ReturnType<typeof readiness> }) {
  return (
    <div className="ai-studio-grid">
      <section className="ai-card">
        <h2>Saved setup</h2>
        <p><span className={`ai-status ${ready.tone}`}><i />{ready.label}</span></p>
        <p>{engineLabel(agent.execution_engine)} · {formatDid(agent.did)}</p>
        <p>{route.currentDetail}</p>
        <div className="ai-actions">
          <Link className="ws-btn primary" href={`/account/ai/extensions/${agent.id}?tab=configuration`}>Edit configuration</Link>
          <Link className="ws-btn ghost" href={`/account/ai/extensions/${agent.id}?tab=prompt`}>Edit instructions</Link>
        </div>
        <form action={pauseVirtualAgentForm}>
          <input type="hidden" name="agent_id" value={agent.id} />
          <input type="hidden" name="paused" value={agent.status === "PAUSED" ? "off" : "on"} />
          <button className="ws-btn ghost" type="submit">{agent.status === "PAUSED" ? "Resume" : "Pause"}</button>
          <p>{agent.status === "PAUSED" ? "Calls stay on the backup destination while this is paused." : "Pausing keeps the number on the current route. It does not delete the configuration."}</p>
        </form>
        <h3>Delete this receptionist</h3>
        <p>Deleting removes the greeting, knowledge, and saved 3CX identifier for {agent.name}. The phone number stays on the current route, and no call is placed.</p>
        <form action={deleteVirtualAgentForm}>
          <input type="hidden" name="agent_id" value={agent.id} />
          <label className="ai-field">Type {agent.name} to confirm <input name="confirm_name" required autoComplete="off" /></label>
          <button className="ws-btn danger" type="submit">Delete receptionist</button>
        </form>
      </section>
      <RouteCard route={route} agent={agent} />
    </div>
  );
}

function Prompt({ agent, route, ready }: { agent: VirtualAgent; route: ReturnType<typeof routeFacts>; ready: ReturnType<typeof readiness> }) {
  const greeting = greetingText(agent.greeting);
  return (
    <div className="ai-prompt-grid">
      <form className="ai-card" action={updateVirtualAgentForm}>
        <Hidden agent={agent} tab="prompt" show="prompt" />
        <PromptStudio summary={agent.business_summary} instructions={agent.instructions} summaryMax={BUSINESS_SUMMARY_MAX} instructionMax={INSTRUCTION_MAX} tokens={[...INSTRUCTION_TOKENS]} defaultInstructions={PROMPT_TEMPLATES[0].text} />
        <div className="ai-greeting-lock">
          <strong>Greeting</strong>
          <p>The greeting is set in Configuration. Edit it there if you want to change it.</p>
          <p>“{greeting}”</p>
          <Link href={`/account/ai/extensions/${agent.id}?tab=configuration`}>Configured under Configuration</Link>
        </div>
        <div className="ai-actions">
          <Link className="ws-btn ghost" href={`/account/ai/extensions/${agent.id}?tab=prompt`}>Discard</Link>
          <button className="ws-btn primary" type="submit">Save instructions</button>
        </div>
      </form>
      <div>
        <aside className="ai-card">
          <h2>Writing guidance</h2>
          <ul className="ai-guide-list">
            <li><strong>Role and tone</strong><span>Use the saved tone. Stay brief and professional.</span></li>
            <li><strong>Approved facts</strong><span>Use the business summary and saved knowledge. Do not invent staff, prices, or extension numbers.</span></li>
            <li><strong>Caller questions</strong><span>Ask for the caller’s name and reason. Keep one question at a time.</span></li>
            <li><strong>Transfer rules</strong><span>Transfer only to destinations approved in Configuration. If a transfer fails, say the extension is not available.</span></li>
          </ul>
          <div className="ai-locked">Platform safety rules stay on. They are not edited here.</div>
        </aside>
        <aside className="ai-card">
          <h2>Readiness</h2>
          <p><span>Saved setup</span> <strong className={`ai-status ${ready.tone}`}><i />{ready.label}</strong></p>
          <p><span>Phone-system confirmation</span> <strong className={`ai-status ${route.confirmed ? "ok" : "warn"}`}><i />{route.confirmed ? "Confirmed" : "Pending"}</strong></p>
          <p><span>Current route</span> <strong>{route.current}</strong></p>
        </aside>
      </div>
    </div>
  );
}

function Config({
  agent, view, numbers, accents, languages, purposes, targets, route, href,
}: {
  agent: VirtualAgent;
  view: "configuration" | "hours";
  numbers: { did: string }[];
  accents: ReturnType<typeof accentSelection>;
  languages: ReturnType<typeof languagesForPlan>;
  purposes: { code: string; label: string }[];
  targets: { value: string; name: string; kind: string; label: string }[];
  route: ReturnType<typeof routeFacts>;
  href: (tab: string) => string;
}) {
  const options = numbers.some((item) => item.did === agent.did) || !agent.did ? numbers : [{ did: agent.did }, ...numbers];
  const hours = readOfficeHours(agent.after_hours);
  const transfers = agent.allowed_transfers.split(",").map((item) => item.trim()).filter(Boolean);
  return (
    <div className="ai-config">
      <nav className="ai-subnav">
        <Link className={view === "configuration" ? "active" : ""} href={href("configuration")}>Identity and answering</Link>
        <Link href={`${href("configuration")}#voice`}>Voice and language</Link>
        <Link className={view === "hours" ? "active" : ""} href={href("hours")}>Hours and transfers</Link>
      </nav>
      <form className="ai-card" action={updateVirtualAgentForm}>
        <Hidden agent={agent} tab={view} show={view} />
        {view === "configuration" ? (
          <>
            <h2>Identity and answering</h2>
            <p>Set the basic details for this receptionist.</p>
            <label className="ai-field">Name <input name="name" required defaultValue={agent.name} /><small>This name identifies the receptionist in your account.</small></label>
            <div className="ai-split">
              <label className="ai-field">Purpose
                <select name="agent_type" defaultValue={agent.agent_type}>
                  {purposes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                  {purposes.some((item) => item.code === agent.agent_type) ? null : <option value={agent.agent_type}>{typeLabel(agent.agent_type)}</option>}
                </select>
              </label>
              <label className="ai-field">Answering mode
                <select name="engine" defaultValue={agent.execution_engine}>
                  <option value="SAUTICALL_PROGRAMMABLE">SautiCall AI</option>
                  <option value="THREE_CX_NATIVE">3CX Native</option>
                </select>
                <small>SautiCall AI answers on the virtual destination. 3CX Native keeps the prompt here until 3CX confirms it.</small>
              </label>
            </div>
            <label className="ai-field">Phone number
              <select name="did" required defaultValue={agent.did}>
                {options.length === 0 ? <option value="">Buy a number first</option> : options.map((item) => <option key={item.did} value={item.did}>{formatDid(item.did)}</option>)}
              </select>
              <small>The number this receptionist is prepared to answer. Saving does not move it.</small>
            </label>
            <h2 id="voice">Voice and language</h2>
            <div className="ai-split">
              <ToneSelect value={agent.tone} />
              <ChoiceSelect label="Language" name="language" value={agent.language || "en-US"} options={languages.map((language) => ({ value: language.id, label: language.label }))} required />
              <ChoiceSelect label="Voice preference" name="gender" value={agent.voice_gender || "neutral"} options={GENDERS.map((gender) => ({ value: gender.id, label: gender.label }))} required />
              <AccentSelect accents={accents} value={agent.voice_label} />
            </div>
            <GreetingSelect value={agent.greeting} />
            <p><Link href={href("hours")}>Configure hours and transfers</Link></p>
          </>
        ) : (
          <>
            <h2>Office hours</h2>
            <p>Set when this receptionist answers live. Outside these hours, the after-hours behavior applies.</p>
            <div className="ai-hours">
              <ChoiceSelect label="Opens" name="open_time" value={hours.open} options={officeOptions()} required />
              <ChoiceSelect label="Closes" name="close_time" value={hours.close} options={officeOptions()} required />
            </div>
            <p className="ai-note">Times use the hours saved for this receptionist.</p>
            <AfterHoursFields action={hours.action} target={hours.target} targets={targets} />
            <h2>Approved transfers</h2>
            <TransferPicker targets={targets} selected={transfers} />
          </>
        )}
        <p>Saving prepares this configuration. The live number keeps its current route until 3CX confirms the destination. No call is placed.</p>
        <div className="ai-actions">
          <Link className="ws-btn ghost" href={href(view)}>Discard</Link>
          <button className="ws-btn primary" type="submit">Save configuration</button>
        </div>
      </form>
      <div>
        <RouteCard route={route} agent={agent} />
        <aside className="ai-card">
          <h2>Phone system details</h2>
          <p>System identifier</p>
          <strong>{agent.client_id || "Not recorded"}</strong>
          <p>Recorded from the phone system when an administrator saves the Service Principal.</p>
          <h3>Approved transfers</h3>
          {transfers.length === 0 ? <p>No destination is approved yet.</p> : transfers.map((item) => {
            const match = targets.find((target) => target.value === item);
            return <p key={item}>{match ? `${match.name} (${item})` : item}</p>;
          })}
          <p>Transfers stay inside this workspace.</p>
        </aside>
      </div>
    </div>
  );
}

function Activity({ agent, knowledge, sessions }: { agent: VirtualAgent; knowledge: { id: number; body: string }[]; sessions: { id: number; outcome: string; state: string; media_open: number }[] }) {
  return (
    <div className="ai-studio-grid">
      <section className="ai-card">
        <h2>Calls</h2>
        {sessions.length === 0 ? <p>No sessions are stored. A telephone session is not opened from this page.</p> : sessions.map((item) => (
          <p key={item.id}>{item.outcome || item.state}. Media {item.media_open ? "open" : "closed"}.</p>
        ))}
        <h3>Text preview</h3>
        <p>This does not dial, answer, or move the phone number.</p>
        <form action={previewVirtualAgentForm}>
          <input type="hidden" name="agent_id" value={agent.id} />
          <label className="ai-field">What the caller says <input name="utterance" required /></label>
          <button className="ws-btn primary" type="submit">Run text preview</button>
        </form>
      </section>
      <section className="ai-card">
        <h2>Approved information</h2>
        <form action={saveKnowledgeForm}>
          <input type="hidden" name="agent_id" value={agent.id} />
          <label className="ai-field">Company information <textarea name="body" rows={5} required /></label>
          <p>Saved notes are data. They cannot approve a transfer or change the route.</p>
          <button className="ws-btn primary" type="submit">Save knowledge</button>
        </form>
        {knowledge.length === 0 ? <p>No approved information is saved.</p> : knowledge.map((item) => <div className="ai-preview" key={item.id}>{item.body}</div>)}
      </section>
    </div>
  );
}

function RouteCard({ route, agent }: { route: ReturnType<typeof routeFacts>; agent: VirtualAgent }) {
  return (
    <aside className="ai-card">
      <h2>Routing summary</h2>
      <p>Current destination</p>
      <strong>{route.current}</strong>
      <p>{route.currentDetail}</p>
      <p>Proposed destination</p>
      <strong>{route.proposed}</strong>
      <p>{route.proposedDetail}</p>
      <p>Confirmation <span className={`ai-status ${route.confirmed ? "ok" : "warn"}`}><i />{route.confirmed ? "Confirmed" : "Pending"}</span></p>
      <div className="ai-note">Saving prepares this configuration. The live number continues on its current route until the existing verification process confirms the destination. {engineLabel(agent.execution_engine)}.</div>
    </aside>
  );
}

function Hidden({ agent, tab, show }: { agent: VirtualAgent; tab: string; show: "prompt" | "configuration" | "hours" }) {
  const transfers = agent.allowed_transfers.split(",").map((item) => item.trim()).filter(Boolean);
  return (
    <>
      <input type="hidden" name="agent_id" value={agent.id} />
      <input type="hidden" name="tab" value={tab} />
      {show !== "configuration" ? <input type="hidden" name="name" value={agent.name} /> : null}
      {show !== "configuration" ? <input type="hidden" name="agent_type" value={agent.agent_type} /> : null}
      {show !== "configuration" ? <input type="hidden" name="engine" value={agent.execution_engine} /> : null}
      {show !== "configuration" ? <input type="hidden" name="did" value={agent.did} /> : null}
      {show !== "prompt" ? <input type="hidden" name="business_summary" value={agent.business_summary} /> : null}
      {show !== "configuration" ? <input type="hidden" name="tone" value={agent.tone} /> : null}
      {show !== "configuration" ? <input type="hidden" name="voice" value={agent.voice_label} /> : null}
      {show !== "configuration" ? <input type="hidden" name="gender" value={agent.voice_gender} /> : null}
      {show !== "configuration" ? <input type="hidden" name="language" value={agent.language} /> : null}
      {show !== "configuration" ? <input type="hidden" name="greeting" value={agent.greeting} /> : null}
      {show !== "prompt" ? <input type="hidden" name="instructions" value={agent.instructions} /> : null}
      {show !== "hours" ? <input type="hidden" name="after_hours" value={agent.after_hours} /> : null}
      {show !== "hours" ? transfers.map((item) => <input key={item} type="hidden" name="transfers" value={item} />) : null}
    </>
  );
}

function editorView(tab?: string): "overview" | "prompt" | "configuration" | "hours" | "activity" {
  if (tab === "prompt" || tab === "knowledge") return "prompt";
  if (tab === "hours" || tab === "routing") return "hours";
  if (tab === "configuration" || tab === "voice") return "configuration";
  if (tab === "activity" || tab === "calls" || tab === "test") return "activity";
  return "overview";
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
  if (!agent.instructions.trim() || !agent.did) return { label: "Incomplete", tone: "warn" };
  return { label: "Awaiting confirmation", tone: "warn" };
}

function routeFacts(agent: VirtualAgent) {
  const confirmed = agent.binding_status === "ACTIVE" && Boolean(agent.route_target);
  const current = agent.assignment_state === "fallback"
    ? (agent.fallback_label || "Backup destination")
    : (agent.previous_route || agent.fallback_label || "Main ring group");
  return {
    current,
    currentDetail: confirmed ? "3CX confirmed this destination." : `Calls to ${formatDid(agent.did)} continue on ${current}.`,
    proposed: `${agent.name} virtual destination`,
    proposedDetail: confirmed ? "This destination is confirmed." : "Confirmation pending.",
    confirmed,
    live: confirmed ? agent.route_target : "Unchanged",
  };
}

function officeOptions() {
  return OFFICE_TIMES.map((time) => ({ value: time, label: officeTimeLabel(time) }));
}
