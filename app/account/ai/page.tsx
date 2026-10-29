import Link from "next/link";
import { guardAccount } from "@/lib/guard";
import { AI_SWITCHES, customerAiState, featureReady, type AiSwitchCode } from "@/lib/ai-system";
import { enabledSwitchCodes } from "@/lib/ai-store";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

const SERVICES = AI_SWITCHES.filter((item) => item.code !== "master");

export default async function AccountAiPage() {
  const user = await guardAccount();
  const plan = paidPlan(user.id);
  const included = planAllows(plan, "ai");
  const enabled = enabledSwitchCodes();
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>AI services</h1>
        <p>Each service follows the switches an administrator saved and the plan on this account. Nothing here places a call.</p>
      </header>
      <div className="contact-form">
        {SERVICES.map((item) => {
          const state = customerAiState({
            master: featureReady(enabled, "master"),
            feature: featureReady(enabled, item.code as AiSwitchCode),
            planIncludes: included,
          });
          return (
            <article key={item.code}>
              <h3>{item.label}</h3>
              <p>{item.detail}</p>
              <p><strong>{state.label}</strong></p>
            </article>
          );
        })}
        {included ? null : <p><Link className="text-link" href="/account/billing/plan">See plans</Link></p>}
      </div>
    </div>
  );
}
