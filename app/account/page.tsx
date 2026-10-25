import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { guardAccount } from "@/lib/guard";
import { getDb } from "@/lib/db";
import { minuteBalance } from "@/lib/minutes";
import { paidPlan } from "@/lib/pbx";
import { featureLabels, planAllows } from "@/lib/plan-features";
import { loadSite } from "@/lib/site";

export default async function AccountHome() {
  const user = await guardAccount();
  const site = loadSite();
  const copy = site.account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const requests = getDb().prepare("SELECT kind, status, payload, created_at FROM account_requests WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(user.id) as { kind: string; status: string; payload: string; created_at: string }[];
  const setup = requests.find((item) => item.kind === "setup");
  const setupPayload = setup ? JSON.parse(setup.payload) as { plan?: string; prompt?: string } : null;
  const minutes = minuteBalance(user.id);
  const plan = paidPlan(user.id);
  const lines = getDb().prepare("SELECT status FROM phone_lines WHERE user_id = ?").all(user.id) as { status: string }[];
  const connected = lines.some((line) => line.status === "trunk_live" || line.status === "trunk_done");
  const bought = lines.some((line) => line.status !== "not_on_carrier");
  return (
    <Frame pathname="/account">
      <main>
        <AccountHero eyebrow={text("welcomeEyebrow")} title={`${text("welcomeTitle")} ${user.name}`} body={text("welcomeBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account" />
            {connected ? null : (
              <p className="form-feedback">
                {bought ? "Your number is bought. Connecting it for calls is still being finished." : "Buy a business number before this account can make or receive calls. An extension by itself cannot place or receive calls."}
                {bought ? null : <> <Link className="text-link" href="/account/numbers">Buy a number</Link></>}
              </p>
            )}
            <div className="cta-pair" style={{ marginBottom: 28 }}>
              <Link className="btn btn-primary" href="/account/billing">Choose a plan</Link>
              <Link className="btn btn-secondary" href="/account/phone">Phone system</Link>
            </div>
            <article className="feature-card" style={{ marginBottom: 22 }}>
              <h3>{plan ? plan.name : "No plan yet"}</h3>
              {plan ? (
                <>
                  <p>{plan.seats || 0} {plan.seats === 1 ? "person" : "people"} · {plan.includedMinutes} outbound minutes each month.</p>
                  <ul className="desk-lines">{featureLabels(plan.features).map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  <p>{planAllows(plan, "ai") ? `AI receptionist is included${planAllows(plan, "ai_any_language") ? " and understands any language." : "."}` : "AI receptionist is not included on this plan."}</p>
                </>
              ) : <p><Link className="text-link" href={setupPayload?.plan ? `/account/billing?plan=${encodeURIComponent(setupPayload.plan)}` : "/account/billing"}>Choose a plan</Link> to open the phone features it includes.</p>}
              {setupPayload?.prompt ? <p>You described this when you signed up: {setupPayload.prompt}</p> : null}
            </article>
            <div className="features-grid">
              <article className="feature-card">
                <h3>Services</h3>
                <p>{requests.length ? `${requests.length} saved request${requests.length === 1 ? "" : "s"}.` : text("emptyServices")}</p>
              </article>
              <article className="feature-card">
                <h3>Call minutes</h3>
                <p>{minutes.minutesLeft} outbound minutes left.</p>
                <p><Link className="text-link" href="/account/minutes">Buy minutes</Link></p>
              </article>
              <article className="feature-card">
                <h3>Account</h3>
                <p>{user.email}</p>
              </article>
              <article className="feature-card">
                <h3>Support</h3>
                <p>{(getDb().prepare("SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND status NOT IN ('resolved', 'closed')").get(user.id) as { n: number }).n} open tickets.</p>
                <p><Link className="text-link" href="/account/tickets">Open a ticket</Link></p>
              </article>
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
