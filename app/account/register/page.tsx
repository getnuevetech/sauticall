import { redirect } from "next/navigation";
import { Frame } from "@/components/site/Frame";
import { AuthForm } from "@/components/account/AuthForm";
import { register } from "../actions";
import { currentUser } from "@/lib/auth";
import { flagOn, getDb, readDoc } from "@/lib/db";
import { featureLabels, normalizePlans } from "@/lib/plan-features";
import { loadSite } from "@/lib/site";
import type { Plan } from "@/lib/types";

function savedPlan(userId: number) {
  const row = getDb().prepare("SELECT payload FROM account_requests WHERE user_id = ? AND kind = 'setup' ORDER BY id DESC LIMIT 1").get(userId) as { payload: string } | undefined;
  if (!row) return "";
  const payload = JSON.parse(row.payload) as { plan?: string };
  return payload.plan || "";
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string; setup?: string }> }) {
  const params = await searchParams;
  const planName = String(params.plan || "");
  const setup = String(params.setup || "").slice(0, 400);
  const user = await currentUser();
  if (user?.role === "customer") {
    const saved = planName || savedPlan(user.id);
    redirect(saved ? `/account/billing?plan=${encodeURIComponent(saved)}` : "/account/billing");
  }
  if (user) redirect("/admin");
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("auth.signup");
  const chosen = normalizePlans(readDoc<Plan[]>("plans")).find((plan) => plan.name === planName && !plan.custom);
  return (
    <Frame pathname="/account/register">
      <main>
        <section className="inner-hero">
          <div className="wrap">
            <span className="eyebrow">{text("registerEyebrow")}</span>
            <h1>{text("registerTitle")}</h1>
            <p>{text("registerBody")}</p>
          </div>
        </section>
        <section className="section">
          <div className="wrap" style={{ maxWidth: 640 }}>
            {chosen ? (
              <article className="feature-card" style={{ marginBottom: 18 }}>
                <h3>{chosen.name}</h3>
                <p>${chosen.price} per month · {chosen.seats} {chosen.seats === 1 ? "person" : "people"} · {chosen.includedMinutes} outbound minutes.</p>
                <ul className="desk-lines">{featureLabels(chosen.features).map((feature) => <li key={feature}>{feature}</li>)}</ul>
                {setup ? <p>You asked for: {setup}</p> : null}
              </article>
            ) : null}
            {open ? (
              <AuthForm
                action={register}
                submit={text("registerSubmit") || "Create account"}
                fields={[
                  { name: "name", label: "Full name", placeholder: "Your name" },
                  { name: "email", label: "Work email", type: "email", placeholder: "you@business.com" },
                  { name: "password", label: "Password", type: "password" },
                ]}
                extra={<><input type="hidden" name="plan" value={chosen?.name || ""} /><input type="hidden" name="setup" value={setup} /><p>Already registered? <a className="text-link" href="/account/login">Sign in</a></p></>}
              />
            ) : (
              <div className="contact-form"><p>{text("registerClosed")}</p></div>
            )}
          </div>
        </section>
      </main>
    </Frame>
  );
}
