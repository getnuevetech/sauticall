import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { guardAccount } from "@/lib/guard";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

export default async function AccountAiPage() {
  const user = await guardAccount();
  const plan = paidPlan(user.id);
  const included = planAllows(plan, "ai");
  const anyLanguage = planAllows(plan, "ai_any_language");
  return (
    <Frame pathname="/account/ai">
      <main>
        <AccountHero eyebrow="AI" title="AI receptionist" body={included ? "This is turned on for the plan you subscribed to." : "This stays off until your plan includes it."} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/ai" />
            <div className="contact-form">
              {included ? (
                <>
                  <h3>{plan?.name} includes the AI receptionist</h3>
                  <p>{anyLanguage ? "Callers can speak any language. The receptionist follows what they say and routes the call." : "The receptionist answers in the account language. Any-language understanding is not checked on this plan."}</p>
                </>
              ) : (
                <>
                  <h3>AI receptionist is not included{plan ? ` on ${plan.name}` : ""}</h3>
                  <p>An administrator has to check AI receptionist on your plan before this account can use it.</p>
                  <p><Link className="text-link" href="/account/billing">See plans</Link></p>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
