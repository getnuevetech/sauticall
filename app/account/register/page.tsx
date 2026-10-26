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
        kicker="Create account"
        art="/marketing/signup-art.png"
        title={<>Your next business <span className="accent">call starts here.</span></>}
        lead="Bring your numbers, team and call handling together with SautiCall."
        step="account"
        points={["One account for your business", "Guided setup for your team", "Review your plan before payment"]}
      >
        <h1>Let&apos;s get you started</h1>
        <p>Create your SautiCall account. Next, review your plan and payment details.</p>
        {chosen ? <p>Selected plan: {chosen.name} · ${chosen.price}/month · {chosen.seats || 1} {chosen.seats === 1 ? "person" : "people"} · {chosen.includedMinutes} outbound minutes. {featureLabels(chosen.features).slice(0, 4).join(", ")}</p> : null}
        {setup ? <p>You asked for: {setup}</p> : null}
        {open ? (
          <AuthForm
            className="pub-form"
            action={register}
            submit="Create account →"
            fields={[
              { name: "name", label: "Full name", placeholder: "Your full name" },
              { name: "email", label: "Email address", type: "email", placeholder: "you@business.com" },
              { name: "password", label: "Password", type: "password", placeholder: "Create a password" },
            ]}
            extra={<>
              <input type="hidden" name="plan" value={chosen?.name || ""} />
              <input type="hidden" name="setup" value={setup} />
              <label className="check-option"><input name="terms" type="checkbox" required /> I agree to create this account and to be contacted about the service.</label>
              <p>Password must be at least 8 characters.</p>
            </>}
          />
        ) : <p>{text("registerClosed")}</p>}
        {open ? <p>Already have an account? <Link href="/account/login">Sign in</Link></p> : null}
        <p>Questions before you start? <Link href="/contact">Contact us</Link></p>
      </AuthSplit>
    </Frame>
  );
}
