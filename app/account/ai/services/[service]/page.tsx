import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { acceptAiTerms, requestAiService, saveAccountAiForm, setAiService } from "../../actions";
import { PromptEditor } from "@/components/account/PromptEditor";
import { guardAccount } from "@/lib/guard";
import { knownAccountAi, systemsForPlan } from "@/lib/ai-account";
import { aiSettingsFor, listAiExtensions, listPromptVersions } from "@/lib/ai-account-store";
import { listAccountAgents } from "@/lib/ai-virtual-store";
import { listClips } from "@/lib/ai-audio-store";
import { outcomeLabel } from "@/lib/ai-notify";
import { listCampaigns, listRecipients } from "@/lib/ai-notify-store";
import { AI_PLAN_FEATURE, NOTIFICATION_ACKS, activationState, featureReady } from "@/lib/ai-system";
import { acceptedVersion, currentAgreement, enabledSwitchCodes, entitlementFor } from "@/lib/ai-store";
import { AI_WORKSPACE_TABS, aiSaveNotice, serviceChecks, switchCodeFor, workspaceProfile, workspaceTab, type SetupFacts } from "@/lib/ai-workspace";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

const BLOCKED = new Set(["pending_terms", "pending_review", "ready_to_request", "off_global", "suspended"]);

export default async function AccountAiServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const { service } = await params;
  if (!knownAccountAi(service)) notFound();
  const user = await guardAccount();
  const query = await searchParams;
  const tab = workspaceTab(query.tab);
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const system = systemsForPlan(plan?.features || []).find((item) => item.code === service);
  if (!system) notFound();
  const profile = workspaceProfile(service);
  const settings = aiSettingsFor(user.id, service);
  const extensions = profile.usesExtension && !profile.virtualDestination ? listAiExtensions(user.id) : [];
  const assigned = extensions.find((item) => item.ai_role === service);
  const virtualReady = profile.virtualDestination && listAccountAgents(user.id).some((item) => item.agent_type === service);
  const enabled = enabledSwitchCodes();
  const switchCode = switchCodeFor(service);
  const agreement = switchCode ? currentAgreement(switchCode) : undefined;
  const ent = switchCode ? entitlementFor(user.id, switchCode) : undefined;
  const state = switchCode && ent ? activationState({
    globalOn: featureReady(enabled, switchCode),
    planIncludes: planAllows(plan, AI_PLAN_FEATURE[switchCode]),
    publishedVersion: agreement?.version || 0,
    acceptedVersion: acceptedVersion(user.id, switchCode),
    grant: ent.grant,
    customerEnabled: ent.customerEnabled,
    reviewRequired: switchCode === "notifications",
  }) : null;
  const facts: SetupFacts = {
    included: system.included,
    named: Boolean(settings?.display_name || assigned?.ai_name),
    hasInstructions: Boolean(settings?.greeting.trim()),
    extensionAssigned: profile.virtualDestination ? virtualReady : Boolean(assigned),
    serviceOn: state?.code === "active",
    termsOpen: Boolean(state && BLOCKED.has(state.code)),
  };
  const checks = serviceChecks(service, facts);
  const notice = aiSaveNotice(query.saved);
  const here = `/account/ai/services/${service}?tab=${tab}`;
  const versions = tab === "activity" || tab === "instructions" ? listPromptVersions(user.id, service) : [];
  const clips = service === "tts" && tab === "activity" && system.included ? listClips(user.id) : [];
  const campaigns = service === "notifications" && tab === "activity" && system.included ? listCampaigns(user.id) : [];
  const recipients = service === "notifications" && tab === "activity" && system.included ? listRecipients(user.id) : [];
  const multilingual = service === "receptionist" && planAllows(plan, "ai_any_language");
  return (
    <div className="workspace-page">
      <Link className="ws-back" href="/account/ai">AI services</Link>
      <header className="workspace-page-head">
        <h1>{system.label}</h1>
        <p>{system.detail} {profile.workflow}</p>
      </header>
      <nav className="ws-tabs">
        {AI_WORKSPACE_TABS.map((item) => (
          <Link key={item} className={tab === item ? "active" : ""} href={`/account/ai/services/${service}?tab=${item}`}>
            {item === "instructions" ? profile.instructionTab : item === "overview" ? "Overview" : item === "configuration" ? "Configuration" : "Activity"}
          </Link>
        ))}
      </nav>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {tab === "overview" ? (
        <article className="contact-form">
          <h3>Purpose</h3>
          <p>{system.detail}</p>
          <p>{profile.workflow}</p>
          <div className="ws-steps">
            {checks.map((item) => (
              <div className={`ws-step${item.done ? " done" : ""}`} key={item.key}>
                <i>{item.done ? "✓" : ""}</i>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              </div>
            ))}
          </div>
          {system.included && switchCode && state ? (
            <>
              {state.code === "pending_terms" && agreement ? (
                <form action={acceptAiTerms}>
                  <input type="hidden" name="feature" value={switchCode} />
                  <input type="hidden" name="next" value={`/account/ai/services/${service}?tab=overview`} />
                  <h3>{agreement.title}</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{agreement.body}</p>
                  {switchCode === "notifications" ? NOTIFICATION_ACKS.map((ack) => (
                    <label className="num-terms" key={ack.code}><input type="checkbox" name={ack.code} value="on" /> {ack.label}</label>
                  )) : <label className="num-terms"><input type="checkbox" name="accept" value="on" /> I accept these terms.</label>}
                  <button className="ws-btn primary" type="submit">Accept terms</button>
                </form>
              ) : null}
              {state.code === "ready_to_request" ? (
                <form action={requestAiService}>
                  <input type="hidden" name="feature" value={switchCode} />
                  <input type="hidden" name="next" value={`/account/ai/services/${service}?tab=overview`} />
                  <button className="ws-btn primary" type="submit">Request activation</button>
                </form>
              ) : null}
              {state.code === "paused" || state.code === "active" ? (
                <form action={setAiService}>
                  <input type="hidden" name="feature" value={switchCode} />
                  <input type="hidden" name="enabled" value={state.code === "active" ? "off" : "on"} />
                  <input type="hidden" name="next" value={`/account/ai/services/${service}?tab=overview`} />
                  <button className="ws-btn ghost" type="submit">{state.code === "active" ? "Turn off" : "Turn on"}</button>
                  <p>Turning this {state.code === "active" ? "off" : "on"} does not place a call or change routing.</p>
                </form>
              ) : null}
            </>
          ) : null}
          {!system.included ? <p><Link className="text-link" href="/account/billing/plan">See plans</Link></p> : null}
        </article>
      ) : null}
      {tab === "instructions" ? (
        <article className="contact-form">
          {system.included ? (
            <>
              <PromptEditor feature={service} next={here} saved={settings?.greeting || ""} template={profile.template} guidance={profile.guidance} label={profile.editorLabel} />
            </>
          ) : <p>This service is not included on {plan?.name || "this account"}. <Link className="text-link" href="/account/billing/plan">See plans</Link></p>}
        </article>
      ) : null}
      {tab === "configuration" ? (
        <article className="contact-form">
          {system.included ? (
            <form action={saveAccountAiForm}>
              <input type="hidden" name="feature" value={service} />
              <input type="hidden" name="next" value={here} />
              <label>Name <input name="display_name" defaultValue={settings?.display_name || assigned?.ai_name || ""} required placeholder="Front desk" /></label>
              {profile.virtualDestination ? (
                <p>This service uses a virtual destination. <Link className="text-link" href="/account/ai/extensions">Open AI extensions</Link> to name it, save the prompt, and choose the phone number. A phone-system user is not created.</p>
              ) : profile.usesExtension ? (
                <label>AI extension
                  <select name="extension_id" defaultValue={assigned ? String(assigned.id) : ""}>
                    <option value="">Not assigned</option>
                    {extensions.map((item) => <option key={item.id} value={item.id}>Extension {item.number} · {item.first_name} {item.last_name}</option>)}
                  </select>
                </label>
              ) : null}
              {multilingual ? <p>Language. This plan includes more than one language. A live call still follows the phone system.</p> : null}
              <p>{profile.virtualDestination ? "Saving the name does not move the phone number." : profile.usesExtension ? `Assigning an extension names it for ${system.label}. Routing on the phone system is not changed from here.` : profile.workflow}</p>
              {service === "tts" ? <p><Link className="text-link" href="/account/ai/audio">Open voice and stored audio</Link></p> : null}
              {service === "notifications" ? <p><Link className="text-link" href="/account/ai/notifications">Open the notification workflow</Link></p> : null}
              <button className="ws-btn primary" type="submit">Save settings</button>
            </form>
          ) : <p>This service is not included on {plan?.name || "this account"}. <Link className="text-link" href="/account/billing/plan">See plans</Link></p>}
        </article>
      ) : null}
      {tab === "activity" ? (
        <article className="contact-form">
          <h3>Instructions already saved</h3>
          {versions.length === 0 ? <p>No earlier version is stored.</p> : versions.map((version) => (
            <div key={version.id}>
              <p>Saved before the latest change.</p>
              <div className="ai-preview">{version.body}</div>
            </div>
          ))}
          {service === "tts" ? (
            <>
              <h3>Stored audio</h3>
              {clips.length === 0 ? <p>No audio is stored for this account.</p> : clips.map((clip) => (
                <p key={clip.id}>{clip.title}. {clip.status === "ready" ? "Kept." : "Draft."} {clip.source === "preview" ? "Preview tone, not a spoken voice." : clip.source === "engine" ? "Spoken by the text-to-voice engine." : "Uploaded recording."}</p>
              ))}
            </>
          ) : null}
          {service === "notifications" ? (
            <>
              <h3>Notifications</h3>
              {campaigns.length === 0 ? <p>No notification is prepared.</p> : campaigns.map((campaign) => <p key={campaign.id}>{campaign.name}. No call is placed from this list.</p>)}
              {recipients.map((recipient) => <p key={recipient.id}>{recipient.personName || "Recipient"}. {outcomeLabel(recipient.outcome, recipient.contentPlayed)}</p>)}
            </>
          ) : null}
          {service !== "tts" && service !== "notifications" ? <p>No call results are available. This page does not place a call.</p> : <p>Nothing on this page placed a call.</p>}
        </article>
      ) : null}
    </div>
  );
}
