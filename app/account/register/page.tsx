import { redirect } from "next/navigation";
import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AuthSplit } from "@/components/site/PublicSite";
import { AuthForm } from "@/components/account/AuthForm";
import { register } from "../actions";
import { currentUser } from "@/lib/auth";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { featureLabels, normalizePlans } from "@/lib/plan-features";
import { selectionAdvice, selectionPrompt } from "@/lib/offerings";
import { copyLine, copyTexts } from "@/lib/public-copy";
import { loadSite } from "@/lib/site";
import type { Plan } from "@/lib/types";

function savedPlan(userId: number) {
  const row = getDb().prepare("SELECT payload FROM account_requests WHERE user_id = ? AND kind = 'setup' ORDER BY id DESC LIMIT 1").get(userId) as { payload: string } | undefined;
  if (!row) return "";
  const payload = JSON.parse(row.payload) as { plan?: string };
  return payload.plan || "";
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string; setup?: string; product?: string; people?: string; language?: string; ai?: string }> }) {
  const params = await searchParams;
  const requestedPlan = String(params.plan || "");
  const user = await currentUser();
  if (user?.role === "customer") {
    const saved = requestedPlan || savedPlan(user.id);
    redirect(saved ? `/account/billing?plan=${encodeURIComponent(saved)}` : "/account/billing");
  }
  if (user) redirect("/admin");
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const say = (key: string) => copyLine(copy, "page.account", key);
  const open = flagOn("auth.signup");
  const catalog = normalizePlans(readDoc<Plan[]>("plans"));
  const named = catalog.find((plan) => plan.name === requestedPlan && !plan.custom);
  const advice = named ? null : selectionAdvice(catalog, params);
  if (advice?.custom) redirect(advice.href);
  const chosen = named || catalog.find((plan) => plan.name === advice?.planName && !plan.custom);
  const setup = String(params.setup || (named ? "" : selectionPrompt(params)) || "").slice(0, 400);
  return (
    <Frame pathname="/account/register">
      <AuthSplit
        kicker={say("registerKicker")}
        art="/marketing/signup-art.png"
        title={<>{say("registerHeadline")} <span className="accent">{say("registerHeadlineAccent")}</span></>}
        lead={say("registerLead")}
        step="account"
        points={copyTexts(copy, "page.account", "registerPoints")}
        backLabel={say("authBack")}
        helpLabel={say("authHelp")}
        stepAccount={say("authStepAccount")}
        stepPlan={say("authStepPlan")}
      >
        <h1>{say("registerHeading")}</h1>
        <p>{say("registerBody")}</p>
        {chosen ? <p>Selected plan: {chosen.name} · ${chosen.price}/month · {chosen.seats || 1} {chosen.seats === 1 ? "person" : "people"} · {chosen.includedMinutes} outbound minutes. {featureLabels(chosen.features).slice(0, 4).join(", ")}</p> : null}
        {setup ? <p>You asked for: {setup}</p> : null}
        {open ? (
          <AuthForm
            className="pub-form"
            action={register}
            submit={say("registerSubmit")}
            fields={[
              { name: "name", label: say("registerName"), placeholder: say("registerNameHint") },
              { name: "business", label: say("registerBusiness"), placeholder: say("registerBusinessHint"), optional: true, maxLength: 50 },
              { name: "email", label: say("registerEmail"), type: "email", placeholder: say("registerEmailHint") },
              { name: "phone", label: say("registerPhone"), type: "tel", placeholder: say("registerPhoneHint") },
              { name: "password", label: say("registerPassword"), type: "password", placeholder: say("registerPasswordHint") },
            ]}
            extra={<>
              <input type="hidden" name="plan" value={chosen?.name || ""} />
              <input type="hidden" name="setup" value={setup} />
              <label className="check-option"><input name="terms" type="checkbox" required /> {say("registerTerms")}</label>
              <p>{say("registerPasswordRule")}</p>
            </>}
          />
        ) : <p>{text("registerClosed")}</p>}
        {open ? <p>{say("registerExisting")} <Link href="/account/login">{say("registerExistingLink")}</Link></p> : null}
        <p>{say("registerQuestions")} <Link href="/contact">{say("registerQuestionsLink")}</Link></p>
      </AuthSplit>
    </Frame>
  );
}
