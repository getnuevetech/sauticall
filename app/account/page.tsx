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
  const requests = getDb().prepare("SELECT kind, status, created_at FROM account_requests WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(user.id) as { kind: string; status: string; created_at: string }[];
  const minutes = minuteBalance(user.id);
  const plan = paidPlan(user.id);
  return (
    <Frame pathname="/account">
      <main>
        <AccountHero eyebrow={text("welcomeEyebrow")} title={`${text("welcomeTitle")} ${user.name}`} body={text("welcomeBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account" />
            <div className="cta-pair" style={{ marginBottom: 28 }}>
              <Link className="btn btn-primary" href={text("primaryHref")}>{text("primaryCta")}</Link>
              <Link className="btn btn-secondary" href={text("secondaryHref")}>{text("secondaryCta")}</Link>
            </div>
            <article className="feature-card" style={{ marginBottom: 22 }}>
              <h3>{plan ? plan.name : "No plan yet"}</h3>
              {plan ? (
                <>
                  <p>{plan.seats || 0} {plan.seats === 1 ? "person" : "people"} · {plan.includedMinutes} outbound minutes each month.</p>
                  <ul className="desk-lines">{featureLabels(plan.features).map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  <p>{planAllows(plan, "ai") ? `AI receptionist is included${planAllows(plan, "ai_any_language") ? " and understands any language." : "."}` : "AI receptionist is not included on this plan."}</p>
                </>
              ) : <p><Link className="text-link" href="/account/billing">Choose a plan</Link> to open the phone features it includes.</p>}
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
