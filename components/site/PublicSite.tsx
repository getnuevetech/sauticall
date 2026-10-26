import Link from "next/link";
import { Icon } from "../Icon";
import { SetupAssistant } from "./Interactive";
import { perMinute, planHighlights, wholeMoney } from "@/lib/account-display";
import { normalizePlan, planAllows, type FeatureKey } from "@/lib/plan-features";
import { planSignupPath } from "@/lib/signup";
import { recommendPlan } from "@/lib/setup-assistant";
import type { Faq, Plan, Service } from "@/lib/types";

function str(page: Record<string, unknown>, key: string, fallback = "") {
  const value = page[key];
  return typeof value === "string" && value ? value : fallback;
}

function pricedPlans(plans: Plan[]) {
  return plans.filter((plan) => !plan.custom && plan.price > 0).map((plan) => normalizePlan(plan)).sort((a, b) => a.price - b.price);
}

export function PublicPlans({ plans }: { plans: Plan[] }) {
  const ordered = pricedPlans(plans);
  return (
    <div className="pub-plans">
      {ordered.map((plan, index) => {
        const lines = planHighlights(plan, index > 0 ? ordered[index - 1] : null);
        return (
          <article key={plan.name} className={plan.popular ? "popular" : ""}>
            {plan.popular ? <span className="pub-ribbon">Best for most teams</span> : null}
            <h3>{plan.name}</h3>
            <p>{plan.desc}</p>
            <p className="pub-price">{wholeMoney(plan.price)} <small>/ month</small></p>
            <ul>
              {lines.map((line, lineIndex) => (
                <li key={line} className={lineIndex < 2 ? "meta" : "check"}>
                  {lineIndex < 2 ? <Icon name={lineIndex === 0 ? "users" : "phone"} size={16} /> : null}
                  {line}
                </li>
              ))}
            </ul>
            <Link className={`btn ${plan.popular ? "btn-primary" : "btn-secondary"}`} href={planSignupPath(plan.name)}>Choose {plan.name}</Link>
          </article>
        );
      })}
    </div>
  );
}

function FaqBlock({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="pub-faq">
      {faqs.map((faq, index) => (
        <details key={faq.q} open={index === 0}>
          <summary>{faq.q} <Icon name="arrowdown" size={16} /></summary>
          <p>{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

function Scene() {
  return (
    <div className="pub-scene" aria-hidden="true">
      <div className="pub-laptop">
        <header><span>SautiCall</span><span>Team extensions</span></header>
        <div className="pub-rows">
          <div><span>Sales</span><b>Available</b></div>
          <div><span>Support</span><b>Available</b></div>
          <div><span>Main line</span><span>Open</span></div>
        </div>
      </div>
      <div className="pub-float"><strong>Incoming call</strong><span>Answer, route, or take a message</span></div>
      <div className="pub-handset" />
    </div>
  );
}

export function PublicHome({ page, services, plans, faqs, showDemo }: { page: Record<string, unknown>; services: Service[]; plans: Plan[]; faqs: Faq[]; showDemo: boolean }) {
  const sample = str(page, "chatSampleUser");
  const lowest = pricedPlans(plans)[0];
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{str(page, "eyebrow", "Business calling, connected")}</p>
            <h1>{str(page, "titleLead", "Your business phone system.")} {str(page, "titleAccent", "Your AI receptionist. One place.")}</h1>
            <p>{str(page, "lead", "Bring your business number, team extensions, desk phones and AI call handling together with SautiCall.")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href={str(page, "primaryHref", "/pricing")}>{str(page, "primaryCta", "View plans")}</Link>
              <Link className="btn btn-secondary" href={str(page, "secondaryHref", "/contact")}>{str(page, "secondaryCta", "Talk to us")}</Link>
            </div>
            <p className="pub-fine">{lowest ? `Plans from ${wholeMoney(lowest.price)}/month. ` : ""}Number rental and other charges may apply.</p>
          </div>
          <Scene />
        </div>
      </section>
      <section>
        <div className="wrap pub-band">
          {[
            ["globe", "Local or toll-free numbers", "Get a business number, or bring the one customers already know."],
            ["users", "Team extensions", "Give each person a place on the phone system."],
            ["bot", "AI call handling", "Greet callers, answer approved questions, and route the call."],
            ["settings", "One account", "Manage numbers, users, and settings together."],
          ].map(([icon, title, body]) => (
            <article key={title}><span className="pub-ico"><Icon name={icon} size={18} /></span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>Everything your calls need, working together.</h2>
          <div className="pub-grid-4">
            {services.slice(0, 4).map((service) => (
              <article key={service.title} className="pub-card">
                <span className="pub-ico"><Icon name={service.icon} size={18} /></span>
                <h3>{service.title}</h3>
                <p>{service.desc}</p>
                <Link href={service.href || "/solutions"}>Learn more</Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section pub-dark">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">AI receptionist</p>
            <h2>Give every caller a clear next step.</h2>
            <p>Your AI receptionist can greet callers, answer questions you approve, take a message, and connect the call to the right person.</p>
            <p><Link className="btn btn-primary" href="/ai-receptionist">Explore AI receptionist</Link></p>
          </div>
          <div className="pub-flow">
            <article><strong>Incoming call</strong><p>A customer calls your business.</p></article>
            <span>→</span>
            <article><strong>AI receptionist</strong><p>Greets the caller and follows your instructions.</p></article>
            <span>→</span>
            <article><strong>Next step</strong><p>Connect a person, or take a message.</p></article>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>Tell us what you need. We&apos;ll help you find a setup.</h2>
          <div className="pub-steps">
            <div><b>1</b><strong>Choose a plan</strong><span>Pick the size that fits your team.</span></div>
            <div><b>2</b><strong>Add your business information</strong><span>Save the company name and the people who answer.</span></div>
            <div><b>3</b><strong>Connect your number</strong><span>Buy a new number or start a transfer.</span></div>
            <div><b>4</b><strong>Set up your team</strong><span>Add extensions and choose where calls go.</span></div>
          </div>
          {showDemo ? (
            <SetupAssistant
              title={str(page, "chatTitle", "Find a setup")}
              sub={str(page, "chatSub")}
              status={str(page, "chatStatus", "Ready")}
              placeholder={str(page, "chatPlaceholder")}
              hello={str(page, "chatHello")}
              proposal={str(page, "chatProposal", "Recommended plan")}
              sample={sample}
              initial={sample ? recommendPlan(plans, sample) : null}
            />
          ) : <Link className="btn btn-primary" href="/account/register">Find my setup</Link>}
        </div>
      </section>
      <section className="section" id="plans">
        <div className="wrap">
          <h2>{str(page, "priceTitle", "A plan for the way you work.")}</h2>
          <p>{str(page, "priceBody", "Compare team size, included outbound minutes, and the features your business needs.")}</p>
          <PublicPlans plans={plans} />
          <div className="pub-note"><span>Need a custom setup? Tell us what the priced plans do not cover.</span><Link className="btn btn-secondary" href="/custom">Talk to us</Link></div>
          <p className="pub-fine">{str(page, "disclaimer")}</p>
        </div>
      </section>
      <section className="section">
        <div className="wrap"><h2>Frequently asked questions.</h2><FaqBlock faqs={faqs.slice(0, 6)} /></div>
      </section>
      <section className="pub-end">
        <div className="wrap">
          <div>
            <h2>{str(page, "endTitle", "Make your next hello a better one.")}</h2>
            <p>{str(page, "endBody")}</p>
          </div>
          <div className="pub-actions">
            <Link className="btn btn-primary" href="/account/register">Get started</Link>
            <Link className="btn btn-secondary" href="/contact">Talk to us</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicSolutions({ page, services }: { page: Record<string, unknown>; services: Service[] }) {
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{str(page, "eyebrow", "Solutions")}</p>
            <h1>{str(page, "title", "The right tools for")} {str(page, "titleEm", "every business call.")}</h1>
            <p>{str(page, "lead", "Connect your numbers, team and call handling in one SautiCall account.")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href="/solutions#phone">Explore solutions</Link>
              <Link className="btn btn-secondary" href="/pricing">Compare plans</Link>
            </div>
          </div>
          <Scene />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>What would you like to do?</h2>
          <div className="pub-grid-4">
            {[
              ["phone", "Set up business calling", "/solutions#phone"],
              ["smartphone", "Connect my team", "/solutions#phones"],
              ["bot", "Answer with AI", "/ai-receptionist"],
              ["users", "Manage more calls", "/solutions#center"],
              ["globe", "Keep my number", "/solutions#porting"],
            ].map(([icon, label, href]) => (
              <Link key={label} className="pub-card" href={href}><span className="pub-ico"><Icon name={icon} size={18} /></span><h3>{label}</h3></Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section" id="phone">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">Cloud phone system</p>
            <h2>Bring your team onto one phone system.</h2>
            <p>{services[0]?.desc}</p>
            <ul className="pub-list"><li>Team extensions</li><li>Business hours and routing</li><li>Voicemail and forwarding</li></ul>
            <Link className="btn btn-secondary" href="/pricing">Compare phone system plans</Link>
          </div>
          <Scene />
        </div>
      </section>
      <section className="section" id="phones">
        <div className="wrap pub-split">
          <div className="pub-scene"><div className="pub-handset" style={{ position: "relative", left: 24, bottom: 0 }} /><div className="pub-float" style={{ position: "relative" }}><strong>On the desk or in the app</strong><span>Desk phones and the phone app stay on the same business line.</span></div></div>
          <div>
            <p className="pub-kicker">{str(page, "phonesEyebrow", "Desk phones and softphones")}</p>
            <h2>{str(page, "phonesTitle", "At your desk. On the move.")} {str(page, "phonesTitleEm", "Still your business.")}</h2>
            <p>{str(page, "phonesBody")}</p>
            <Link className="btn btn-secondary" href="/contact">Ask about desk phones</Link>
          </div>
        </div>
      </section>
      <section className="section pub-dark" id="ai">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">AI receptionist</p>
            <h2>A helpful first answer for your callers.</h2>
            <p>Answer routine questions, take messages, and route callers to your team.</p>
            <Link className="btn btn-primary" href="/ai-receptionist">Explore AI receptionist</Link>
          </div>
          <div className="pub-card"><strong>What are your hours?</strong><p>The receptionist answers from the business information you save, then routes the call.</p></div>
        </div>
      </section>
      <section className="section" id="center">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">Shared calling</p>
            <h2>Give busy teams a clearer way to handle calls.</h2>
            <p>Ring groups and call queues are included on the plans that list them. Call reporting is included on Team.</p>
            <Link className="btn btn-secondary" href="/pricing">Explore team plans</Link>
          </div>
          <div className="pub-card"><h3>Shared queue</h3><p>Waiting callers stay in the queue until someone on the plan that includes queues can answer.</p></div>
        </div>
      </section>
      <section className="section" id="numbers">
        <div className="wrap pub-grid-3">
          <article className="pub-card" id="porting">
            <h3>{str(page, "numbersTitle", "Get a business number")}</h3>
            <p>{str(page, "numbersBody")}</p>
            <Link href="/account/register">Explore business numbers</Link>
          </article>
          <article className="pub-card">
            <h3>{str(page, "portingTitle", "Bring your existing number")}</h3>
            <p>{str(page, "portingBody")}</p>
            <Link href="/account/porting">Learn about number transfers</Link>
          </article>
        </div>
      </section>
      <section className="pub-end">
        <div className="wrap">
          <div><h2>Not sure where to start?</h2><p>Describe the calls you want handled. The setup assistant suggests a plan you can subscribe to.</p></div>
          <Link className="btn btn-primary" href="/how-it-works">Find my setup</Link>
        </div>
      </section>
    </main>
  );
}

export function PublicAi({ page, plans, faqs }: { page: Record<string, unknown>; plans: Plan[]; faqs: Faq[] }) {
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{str(page, "eyebrow", "AI receptionist")}</p>
            <h1>{str(page, "title", "A warm welcome.")} {str(page, "titleEm", "A clear next step.")}</h1>
            <p>{str(page, "lead")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href="/pricing">View AI-enabled plans</Link>
              <Link className="btn btn-secondary" href="/contact">Talk to us</Link>
            </div>
          </div>
          <div className="pub-card">
            <p className="pub-kicker">Example call</p>
            <strong>Thanks for calling. How can I help?</strong>
            <p>Caller: Can I speak to sales?</p>
            <p>Result: Transfer to sales.</p>
          </div>
        </div>
      </section>
      <section>
        <div className="wrap pub-band">
          {["Welcome callers", "Answer routine questions", "Capture messages", "Connect your team"].map((item) => (
            <article key={item}><span className="pub-ico"><Icon name="check" size={16} /></span><h3>{item}</h3></article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>See how a call can unfold.</h2>
          <p>Your business information and routing rules guide each step.</p>
          <div className="pub-flow">
            <article><strong>Incoming caller</strong><p>A customer calls the business.</p></article>
            <span>→</span>
            <article><strong>AI receptionist</strong><p>Greets the caller from the greeting you save.</p></article>
            <span>→</span>
            <article><strong>Answer, connect, or take a message</strong><p>Uses the answers, destinations, and hours on the account.</p></article>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-grid-3">
          <article className="pub-card"><h3>Your approved answers</h3><p>The receptionist uses the business information you save, such as hours and the services you offer.</p></article>
          <article className="pub-card"><h3>Your transfer destinations</h3><p>Send the caller to a person or a ring group that is already on the phone system.</p></article>
          <article className="pub-card"><h3>Your message preferences</h3><p>Choose what to capture when nobody can take the call, and where that message should go.</p></article>
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-split">
          <div>
            <h2>You choose how it answers.</h2>
            <p>{str(page, "controlBody", "Greeting, approved answers, transfer rules, and after-hours handling are set in the SautiCall account.")}</p>
            <ul className="pub-list">
              <li>Customize the greeting</li>
              <li>Choose where calls are transferred</li>
              <li>Set after-hours messages</li>
            </ul>
            <Link className="btn btn-primary" href="/account/register?product=ai">Set this up in your account</Link>
          </div>
          <div className="pub-card">
            <h3>What the account controls</h3>
            <p>Greeting, business information, message settings, and after-hours routing.</p>
            <p>Those settings are saved after you sign in. This page does not change a live phone system.</p>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>{str(page, "languageTitle", "Help callers in supported languages.")}</h2>
          <p>{str(page, "languageBody", "Any-language understanding is included only on plans where that feature is turned on.")}</p>
          <p><Link href="/pricing">Check plan features</Link></p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>From setup to your first test call.</h2>
          <div className="pub-steps">
            <div><b>1</b><strong>Choose an AI-enabled plan</strong><span>Small Business and Team include the receptionist when that feature is on the plan.</span></div>
            <div><b>2</b><strong>Add your business information</strong><span>Save the answers the receptionist is allowed to give.</span></div>
            <div><b>3</b><strong>Set transfer and message rules</strong><span>Choose where calls go during the day and after hours.</span></div>
            <div><b>4</b><strong>Test before activation</strong><span>Place a test call and confirm the experience.</span></div>
          </div>
          <form className="pub-note" action="/account/register" method="get">
            <input type="hidden" name="product" value="ai" />
            <label>Team size
              <select name="people" defaultValue="5">
                <option value="1">1 person</option>
                <option value="5">Up to 5 people</option>
                <option value="10">Up to 10 people</option>
              </select>
            </label>
            <label className="check-option"><input type="checkbox" name="language" value="1" /> Callers can use any language</label>
            <button className="btn btn-primary" type="submit">See matching plans</button>
          </form>
          <p className="pub-fine">{plans.filter((plan) => planAllows(normalizePlan(plan), "ai")).map((plan) => plan.name).join(", ") || "No published plan"} include the AI receptionist.</p>
        </div>
      </section>
      <section className="section"><div className="wrap"><h2>Frequently asked questions.</h2><FaqBlock faqs={faqs.slice(0, 5)} /></div></section>
      <section className="pub-end">
        <div className="wrap">
          <h2>Give your callers a better first hello.</h2>
          <div className="pub-actions">
            <Link className="btn btn-primary" href="/pricing">View plans</Link>
            <Link className="btn btn-secondary" href="/contact">Talk to us</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

const COMPARE: { label: string; key?: string; seats?: boolean; minutes?: boolean }[] = [
  { label: "People", seats: true },
  { label: "Outbound minutes per plan period", minutes: true },
  { label: "Softphone access", key: "softphone" },
  { label: "Voicemail & forwarding", key: "voicemail" },
  { label: "Desk phone support", key: "desk_phones" },
  { label: "Business hours & ring groups", key: "business_hours" },
  { label: "AI receptionist", key: "ai" },
  { label: "Call queues", key: "queues" },
  { label: "Call reporting", key: "reporting" },
];

export function PublicPricing({
  page,
  plans,
  faqs,
  bundles,
}: {
  page: Record<string, unknown>;
  plans: Plan[];
  faqs: Faq[];
  bundles: { name: string; minutes: number; price: number }[];
}) {
  const ordered = pricedPlans(plans);
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap">
          <p className="pub-kicker">{str(page, "eyebrow", "Plans & pricing")}</p>
          <h1>{str(page, "title", "Choose the right fit")} {str(page, "titleEm", "for your business calls.")}</h1>
          <p>{str(page, "lead", "Compare team capacity, outbound minutes and the features your business needs.")}</p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <PublicPlans plans={plans} />
          <p className="pub-fine">Desk phone support means a compatible phone can be connected. The phone itself is not included in the monthly price.</p>
          <div className="pub-note"><span>Need a different setup? Describe the team size, call handling, and requirements.</span><Link className="btn btn-primary" href="/custom">Request a custom quote</Link></div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>Compare what&apos;s included.</h2>
          <table className="pub-table">
            <thead><tr><th>Feature</th>{ordered.map((plan) => <th key={plan.name}>{plan.name}</th>)}</tr></thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {ordered.map((plan) => {
                    const allowed = row.key ? planAllows(plan, row.key as FeatureKey) : false;
                    const value = row.seats ? (plan.seats || 1) : row.minutes ? plan.includedMinutes.toLocaleString("en-US") : allowed ? "✓" : "—";
                    const hours = row.key === "business_hours" ? planAllows(plan, "business_hours") && planAllows(plan, "ring_groups") : true;
                    return <td key={plan.name}>{row.key === "business_hours" ? (hours ? "✓" : "—") : value}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pub-fine">A check means that feature is turned on for the plan. An administrator can change plan features.</p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>Understand the full cost.</h2>
          <div className="pub-grid-4">
            <article className="pub-card"><h3>Business numbers</h3><p>Number rental and any setup charges are shown when you select a number.</p></article>
            <article className="pub-card"><h3>Emergency calling</h3><p>An emergency address is required before a number is bought.</p></article>
            <article className="pub-card"><h3>AI receptionist</h3><p>Included on plans that list it. Any-language understanding is a separate plan feature.</p></article>
            <article className="pub-card"><h3>Taxes and other charges</h3><p>Taxes and charges outside the plan price are shown at checkout.</p></article>
          </div>
        </div>
      </section>
      {bundles.length > 0 ? (
        <section className="section">
          <div className="wrap">
            <h2>Need more outbound minutes?</h2>
            <div className="pub-grid-3">
              {bundles.map((bundle) => (
                <article key={bundle.name} className="pub-card">
                  <h3>{bundle.minutes.toLocaleString("en-US")} minutes</h3>
                  <p className="pub-price">{wholeMoney(bundle.price)}</p>
                  <p>{perMinute(bundle.price, bundle.minutes)}</p>
                </article>
              ))}
            </div>
            <p className="pub-fine">Bought minutes last until they are used. <Link href="/account/login">Sign in to manage minutes</Link></p>
          </div>
        </section>
      ) : null}
      <section className="section">
        <div className="wrap">
          <h2>Not sure which plan fits?</h2>
          <form className="pub-note" action="/account/register" method="get">
            <label>Team size
              <select name="people" defaultValue="5">
                <option value="1">1 person</option>
                <option value="5">Up to 5 people</option>
                <option value="10">Up to 10 people</option>
              </select>
            </label>
            <label className="check-option"><input type="checkbox" name="ai" value="1" /> I need AI call answering</label>
            <button className="btn btn-primary" type="submit">Find a suitable plan</button>
          </form>
        </div>
      </section>
      <section className="section"><div className="wrap"><h2>{str(page, "faqTitle", "Frequently asked questions.")}</h2><FaqBlock faqs={faqs} /></div></section>
      <section className="pub-end">
        <div className="wrap">
          <h2>{str(page, "endTitle", "Let's find the right plan for your team.")}</h2>
          <div className="pub-actions">
            <Link className="btn btn-primary" href="/contact">Talk to us</Link>
            <Link className="btn btn-secondary" href="/solutions">Explore solutions</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function AuthSplit({
  title,
  lead,
  kicker,
  children,
  points,
  step,
}: {
  title: string;
  lead: string;
  kicker: string;
  children: React.ReactNode;
  points?: string[];
  step?: "account" | "code";
}) {
  return (
    <main>
      <div className="pub-authbar">
        <Link className="brand" href="/">SautiCall</Link>
        <nav>
          <Link href="/">Back to website →</Link>
          <Link href="/contact">Need help?</Link>
        </nav>
      </div>
      <div className="pub-auth-grid">
        <section className="pub-auth-side">
          <h1>{title}</h1>
          <p>{lead}</p>
          <div style={{ marginTop: 24 }}><Scene /></div>
          {points ? <div className="pub-checks">{points.map((point) => <div key={point}><Icon name="checkcircle" size={16} /> {point}</div>)}</div> : null}
          <p className="pub-legal"><span>© 2026 SautiCall</span><Link href="/contact">Help</Link></p>
        </section>
        <section className="pub-auth-main">
          <p className="pub-kicker">{kicker}</p>
          {step === "account" ? (
            <div className="pub-steps-line"><span className="on">1 Account</span><span>—</span><span>2 Plan & payment</span></div>
          ) : null}
          {children}
        </section>
      </div>
    </main>
  );
}
