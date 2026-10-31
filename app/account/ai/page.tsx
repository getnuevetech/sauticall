import Link from "next/link";
import { acceptAiTerms, requestAiService, saveAccountAiForm, setAiService } from "./actions";
import { guardAccount } from "@/lib/guard";
import { aiConnectionStatus, systemsForPlan } from "@/lib/ai-account";
import { aiSettingsFor, listAiExtensions } from "@/lib/ai-account-store";
import { AI_PLAN_FEATURE, NOTIFICATION_ACKS, activationState, featureReady, type AiSwitchCode } from "@/lib/ai-system";
import { acceptedVersion, currentAgreement, enabledSwitchCodes, entitlementFor } from "@/lib/ai-store";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

export default async function AccountAiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  const plan = paidPlan(user.id);
  const systems = systemsForPlan(plan?.features || []);
  const included = systems.filter((item) => item.included);
  const extensions = listAiExtensions(user.id);
  const enabled = enabledSwitchCodes();
  const notice = query.saved === "terms" ? "Terms accepted. No call was placed."
    : query.saved === "requested" ? "Request sent. No call was placed."
      : query.saved === "service" ? "Saved. No call was placed."
        : query.saved === "configured" ? "AI settings saved. No call was placed."
          : "";
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>AI</h1>
        <p>{plan ? `${plan.name} includes ${included.length} of ${systems.length} AI systems.` : "Choose a plan before an AI system can be configured."} An administrator chooses which systems each plan includes. A system that is not on your plan stays off for this account. Nothing on this page places a call.</p>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      <div className="ai-services">
        {systems.map((system) => {
          const settings = aiSettingsFor(user.id, system.code);
          const assigned = extensions.find((item) => item.ai_role === system.code);
          const status = aiConnectionStatus({
            included: system.included,
            named: Boolean(settings?.display_name || assigned?.ai_name),
            extensionNumber: assigned?.number || "",
            onPhoneSystem: Boolean(assigned && assigned.xapi_id > 0 && assigned.status === "created"),
          });
          const code: Exclude<AiSwitchCode, "master"> | "" = system.code === "notifications" || system.code === "receptionist" || system.code === "personal_assistant" || system.code === "outbound_assistant" || system.code === "setup_assistant" ? system.code : "";
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
          return (
            <article className="contact-form" key={system.code}>
              <h3>{system.label}</h3>
              <p>{system.detail}</p>
              <p><strong>Plan.</strong> {system.included ? "Included on this plan." : `Not included on ${plan?.name || "this account"}.`}</p>
              <p><strong>Configured.</strong> {status.configured}</p>
              <p><strong>Phone system.</strong> {status.phone}</p>
              <p><strong>Live calls.</strong> {status.live}</p>
              {system.included && code && state ? (
                <>
                  <p><strong>Service.</strong> {state.label}</p>
                  {state.code === "pending_terms" && agreement ? (
                    <form action={acceptAiTerms}>
                      <input type="hidden" name="feature" value={code} />
                      <h3>{agreement.title}</h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>{agreement.body}</p>
                      {code === "notifications" ? NOTIFICATION_ACKS.map((ack) => (
                        <label className="num-terms" key={ack.code}><input type="checkbox" name={ack.code} value="on" /> {ack.label}</label>
                      )) : <label className="num-terms"><input type="checkbox" name="accept" value="on" /> I accept these terms.</label>}
                      <button className="ws-btn primary" type="submit">Accept terms</button>
                    </form>
                  ) : null}
                  {state.code === "ready_to_request" ? (
                    <form action={requestAiService}>
                      <input type="hidden" name="feature" value={code} />
                      <button className="ws-btn primary" type="submit">Request activation</button>
                    </form>
                  ) : null}
                  {state.code === "paused" || state.code === "active" ? (
                    <form action={setAiService}>
                      <input type="hidden" name="feature" value={code} />
                      <input type="hidden" name="enabled" value={state.code === "active" ? "off" : "on"} />
                      <button className="ws-btn ghost" type="submit">{state.code === "active" ? "Turn off" : "Turn on"}</button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {system.included ? (
                <form action={saveAccountAiForm}>
                  <input type="hidden" name="feature" value={system.code} />
                  <label>Name <input name="display_name" defaultValue={settings?.display_name || assigned?.ai_name || ""} required placeholder="Front desk" /></label>
                  <label>What this assistant may say <textarea name="greeting" rows={4} defaultValue={settings?.greeting || ""} placeholder="How to greet callers and what this account is willing to share." /></label>
                  <label>AI extension
                    <select name="extension_id" defaultValue={assigned ? String(assigned.id) : ""}>
                      <option value="">Not assigned</option>
                      {extensions.map((item) => <option key={item.id} value={item.id}>Extension {item.number} · {item.first_name} {item.last_name}</option>)}
                    </select>
                  </label>
                  <p>Assigning an extension makes it this account’s AI extension for {system.label}. The name is the name of that AI extension. Routing on the phone system is not changed from here.</p>
                  <button className="ws-btn primary" type="submit">Save {system.label}</button>
                </form>
              ) : <p><Link className="text-link" href="/account/billing/plan">See plans</Link></p>}
              {system.code === "tts" && system.included ? <p><Link className="text-link" href="/account/ai/audio">Store a message</Link></p> : null}
              {system.code === "notifications" && system.included ? <p><Link className="text-link" href="/account/ai/notifications">Prepare a notification</Link></p> : null}
            </article>
          );
        })}
      </div>
      <p>You can also choose the AI system while adding a person on the <Link className="text-link" href="/account/phone">phone system</Link>.</p>
    </div>
  );
}
