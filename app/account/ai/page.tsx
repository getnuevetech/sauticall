import Link from "next/link";
import { acceptAiTerms, requestAiService, setAiService } from "./actions";
import { guardAccount } from "@/lib/guard";
import { AI_PLAN_FEATURE, AI_SWITCHES, NOTIFICATION_ACKS, activationState, featureReady, type AiSwitchCode } from "@/lib/ai-system";
import { acceptedVersion, currentAgreement, enabledSwitchCodes, entitlementFor } from "@/lib/ai-store";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

const SERVICES = AI_SWITCHES.filter((item) => item.code !== "master");

export default async function AccountAiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  const plan = paidPlan(user.id);
  const enabled = enabledSwitchCodes();
  const notice = query.saved === "terms" ? "Terms accepted. No call was placed."
    : query.saved === "requested" ? "Request sent. No call was placed."
      : query.saved === "service" ? "Saved. No call was placed."
        : "";
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>AI services</h1>
        <p>Turn on only a service your plan includes, after the current terms and an administrator's grant where one is required. Nothing here places a call.</p>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      <div className="ai-services">{SERVICES.map((item) => {
        const code = item.code as Exclude<AiSwitchCode, "master">;
        const agreement = currentAgreement(code);
        const ent = entitlementFor(user.id, code);
        const state = activationState({
          globalOn: featureReady(enabled, code),
          planIncludes: planAllows(plan, AI_PLAN_FEATURE[code]),
          publishedVersion: agreement?.version || 0,
          acceptedVersion: acceptedVersion(user.id, code),
          grant: ent.grant,
          customerEnabled: ent.customerEnabled,
          reviewRequired: code === "notifications",
        });
        return (
          <article className="contact-form" key={code}>
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
            <p><strong>{state.label}</strong></p>
            {state.code === "not_in_plan" ? <p><Link className="text-link" href="/account/billing/plan">See plans</Link></p> : null}
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
          </article>
        );
      })}</div>
    </div>
  );
}
