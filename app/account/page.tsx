import Link from "next/link";
import { guardAccount } from "@/lib/guard";
import { getDb } from "@/lib/db";
import { accountUsage } from "@/lib/account-usage";
import { personFirstName, relativeWhen } from "@/lib/account-display";
import { verificationStatus } from "@/lib/account-verify";
import { systemsForPlan } from "@/lib/ai-account";
import { Icon } from "@/components/Icon";

type Line = { status: string };
type Activity = { title: string; detail: string; at: string };

export default async function AccountHome() {
  const user = await guardAccount();
  const usage = accountUsage(user.id);
  const plan = usage.plan;
  const { publishBoughtNumbers } = await import("@/lib/lines");
  publishBoughtNumbers(user.id);
  const lines = getDb().prepare("SELECT status FROM phone_lines WHERE user_id = ?").all(user.id) as Line[];
  const numbers = lines.filter((line) => line.status !== "not_on_carrier").length;
  const people = (getDb().prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ? AND status != 'removed'").get(user.id) as { n: number }).n;
  const groups = (getDb().prepare("SELECT COUNT(*) AS n FROM call_groups WHERE user_id = ?").get(user.id) as { n: number }).n;
  const calls = (getDb().prepare("SELECT COUNT(*) AS n FROM cdr_events WHERE user_id = ?").get(user.id) as { n: number }).n;
  const hours = Boolean(getDb().prepare("SELECT user_id FROM pbx_departments WHERE user_id = ?").get(user.id));
  const seats = plan?.seats && plan.seats > 0 ? plan.seats : 0;
  const includedAi = systemsForPlan(plan?.features || []).filter((item) => item.included);
  const aiIncluded = includedAi.length > 0;
  const activated = numbers > 0;
  const steps = [
    { title: "Create your account", detail: "Your workspace is ready.", href: "/account", done: true, action: "" },
    { title: "Connect a business number", detail: "Get a new number or transfer your existing one.", href: "/account/numbers", done: numbers > 0, action: "Get started" },
    { title: "Set your business hours", detail: "Choose when you want to take calls.", href: "/account/phone", done: hours, action: "Set hours" },
    { title: "Choose how calls are answered", detail: "Set up your AI receptionist or call routing.", href: aiIncluded ? "/account/ai" : "/account/phone", done: groups > 0, action: "Set up" },
    { title: "Make a test call", detail: "See everything working before you go live.", href: "/account/phone", done: calls > 0, action: "Start" },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  const created = getDb().prepare("SELECT created_at FROM users WHERE id = ?").get(user.id) as { created_at: string } | undefined;
  const requests = getDb().prepare("SELECT kind, status, created_at FROM account_requests WHERE user_id = ? ORDER BY id DESC LIMIT 4").all(user.id) as { kind: string; status: string; created_at: string }[];
  const check = verificationStatus(user.id);
  const missing = [check.emailRequired && !check.emailVerified ? "email" : "", check.smsRequired && !check.phoneVerified ? "mobile number" : "", check.addressSaved ? "" : "address"].filter(Boolean);
  const activity: Activity[] = [
    { title: "Account created", detail: "Your workspace is ready to set up.", at: created?.created_at || "" },
    ...requests.map((request) => ({ title: request.kind === "number" ? "Number request" : request.kind === "port" ? "Number transfer" : "Request saved", detail: request.status, at: request.created_at })),
  ].filter((item) => item.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 4);

  return (
    <div className="workspace-page" style={{ maxWidth: 1080 }}>
      <div className="ws-title-row">
        <h1>Welcome back, {personFirstName(user.name)}</h1>
        {doneCount < steps.length ? <span className="ws-pill progress"><i /> Setup in progress</span> : <span className="ws-pill live">Ready</span>}
      </div>
      <p>{doneCount < steps.length ? "Let's get your business ready for its first call." : "Your business phone is ready for calls."}</p>
      {missing.length ? <p>Confirm your {missing.join(", ")}. <Link href="/account/verify">Finish account confirmation</Link></p> : null}
      {next ? (
        <section className="ws-hero">
          <div>
            <h2>Your next step: {next.title.toLowerCase()}</h2>
            <p>{next.detail}</p>
            <div className="ws-actions">
              {next.title.startsWith("Connect") ? (
                <>
                  <Link className="ws-btn primary" href="/account/numbers">Get a number</Link>
                  <Link className="ws-btn ghost" href="/account/porting">Transfer my number</Link>
                </>
              ) : <Link className="ws-btn primary" href={next.href}>{next.action}</Link>}
            </div>
          </div>
          <div className="ws-phone" aria-hidden="true">
            <svg viewBox="0 0 180 110" width="180" height="110">
              <rect x="78" y="18" width="70" height="70" rx="16" fill="#dbe6ff" />
              <path d="M98 62c8-8 18-8 26 0" fill="none" stroke="#2f5bff" strokeWidth="4" strokeLinecap="round" />
              <circle cx="111" cy="48" r="10" fill="#2f5bff" />
              <rect x="20" y="36" width="54" height="36" rx="10" fill="#fff" stroke="#d5e0f5" />
            </svg>
          </div>
        </section>
      ) : null}
      <div className="ws-stats">
        <Link className="ws-stat" href="/account/numbers"><span className="ws-ico"><Icon name="phone" size={18} /></span><span><b>{numbers}</b>{numbers === 0 ? "Add your first number" : "Business numbers"}</span></Link>
        <Link className="ws-stat" href="/account/phone"><span className="ws-ico"><Icon name="users" size={18} /></span><span><b>{seats ? `${people} of ${seats}` : String(people)}</b>{people < seats ? "Invite your team" : "Team members"}</span></Link>
        <Link className="ws-stat" href="/account/minutes"><span className="ws-ico"><Icon name="mic" size={18} /></span><span><b>{activated ? `${usage.remaining} left` : `${usage.included.toLocaleString("en-US")} included`}</b>{activated ? "Outbound minutes" : "Available after activation"}</span></Link>
        <Link className="ws-stat" href="/account/ai"><span className="ws-ico"><Icon name="spark" size={18} /></span><span><b>{aiIncluded ? `${includedAi.length} on this plan` : "None on this plan"}</b>{aiIncluded ? includedAi.map((item) => item.label).slice(0, 2).join(", ") : "AI systems"}</span></Link>
      </div>
      <div className="ws-columns">
        <section className="ws-card">
          <div className="ws-split"><h2>Get ready to take calls</h2><span>{doneCount} of {steps.length} complete</span></div>
          <div className="ws-meter"><span style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} /></div>
          <div className="ws-steps">
            {steps.map((step, index) => {
              const state = step.done ? "done" : step === next ? "current" : "";
              return (
                <div key={step.title} className={`ws-step ${state}`}>
                  <i>{step.done ? "✓" : index + 1}</i>
                  <span><strong>{step.title}</strong><small>{step.detail}</small></span>
                  {!step.done && step === next ? <Link href={step.href}>{step.action || "Continue"}</Link> : <span />}
                </div>
              );
            })}
          </div>
        </section>
        <div>
          <section className="ws-plan-side">
            <span className="tag">{plan ? plan.name : "No plan"}</span>
            <h2>Your plan</h2>
            {plan ? (
              <>
                <p style={{ marginTop: 28 }}>Up to {plan.seats || 1} {plan.seats === 1 ? "member" : "members"}</p>
                <p>{plan.includedMinutes.toLocaleString("en-US")} outbound minutes / month</p>
              </>
            ) : <p style={{ marginTop: 28 }}>Choose a plan to open numbers, people, and calling.</p>}
            <p><Link href="/account/billing/plan">Manage plan</Link></p>
          </section>
          <section className="ws-help">
            <h2>A little help getting started?</h2>
            <p>We can guide you through setup.</p>
            <p><Link href="/account/tickets/new">Talk to support</Link></p>
          </section>
        </div>
      </div>
      <section className="ws-card ws-activity">
        <div className="ws-split"><h2>Recent activity</h2><Link href="/account/billing">View all</Link></div>
        {activity.length === 0 ? <p>No activity yet.</p> : activity.map((item) => (
          <article key={`${item.title}-${item.at}`}>
            <span><b>{item.title}</b><span>{item.detail}</span></span>
            <span>{relativeWhen(item.at)}</span>
          </article>
        ))}
      </section>
    </div>
  );
}
