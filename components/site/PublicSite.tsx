import Link from "next/link";
import { Icon } from "../Icon";
import { SetupAssistant } from "./Interactive";
import { AiCallCard, CallsMock, DeskMock, DevicePair, ExtTable, NumberPair, QueueCard } from "./PublicMocks";
import { recommendPlan } from "@/lib/setup-assistant";
import { perMinute, wholeMoney } from "@/lib/account-display";
import { normalizePlan, planAllows, type FeatureKey } from "@/lib/plan-features";
import { planSignupPath } from "@/lib/signup";
import type { Faq, Plan, Service } from "@/lib/types";

function str(page: Record<string, unknown>, key: string, fallback = "") {
  const value = page[key];
  return typeof value === "string" && value ? value : fallback;
}

function pricedPlans(plans: Plan[]) {
  return plans.filter((plan) => !plan.custom && plan.price > 0).map((plan) => normalizePlan(plan)).sort((a, b) => a.price - b.price);
}

const BLURB: Record<string, string> = {
  Solo: "For one-person businesses.",
  "Small Business": "For small teams.",
  Team: "For busier teams.",
};

function cardLines(plan: Plan, period = false) {
  const seats = plan.seats && plan.seats > 0 ? plan.seats : 1;
  const people = seats === 1 ? "1 person" : `Up to ${seats} people`;
  const minutes = `${plan.includedMinutes.toLocaleString("en-US")} outbound minutes${period ? " per plan period" : ""}`;
  const has = (key: FeatureKey) => planAllows(plan, key);
  if (plan.name === "Team" && has("queues")) {
    return [
      ["users", people],
      ["phone", minutes],
      ["check", "Everything in Small Business"],
      ["check", "Call queues"],
      ["check", "Call reporting"],
    ];
  }
  if (plan.name === "Small Business") {
    return [
      ["users", people],
      ["phone", minutes],
      ["check", period ? "Desk phone support" : "Desk phones"],
      ["check", "Business hours"],
      ["check", "Ring groups"],
      ["check", "AI receptionist"],
    ].filter((line) => line[0] !== "check" || (line[1] === "Desk phone support" || line[1] === "Desk phones" ? has("desk_phones") : line[1] === "AI receptionist" ? has("ai") : true));
  }
  return [
    ["users", people],
    ["phone", minutes],
    ...(has("softphone") ? [["check", "Softphones"]] : []),
    ...(has("voicemail") ? [["check", "Voicemail & forwarding"]] : []),
  ];
}

export function PublicPlans({ plans, verb = "Choose", period = false, home = false }: { plans: Plan[]; verb?: string; period?: boolean; home?: boolean }) {
  const ordered = pricedPlans(plans);
  return (
    <div className={home ? "pub-plans home-plans" : "pub-plans"}>
      {ordered.map((plan) => (
        <article key={plan.name} className={plan.popular ? "popular" : ""}>
          {home && plan.popular ? <span className="home-ribbon">For small teams</span> : null}
          <div className="ws-split"><h3>{plan.name}</h3>{!home && plan.popular ? <span className="pub-ribbon">Best for most teams</span> : null}</div>
          {home ? null : <p>{BLURB[plan.name] || plan.desc}</p>}
          <p className="pub-price">{wholeMoney(plan.price)} <small>/ month</small></p>
          <ul>
            {cardLines(plan, period).map(([kind, line]) => (
              <li key={line} className={kind === "check" ? "check" : "meta"}>
                {!home && kind !== "check" ? <Icon name={kind} size={16} /> : null}
                {line}
              </li>
            ))}
          </ul>
          <Link className={`btn ${plan.popular ? "btn-primary" : "btn-secondary"}`} href={planSignupPath(plan.name)}>{verb} {plan.name}</Link>
        </article>
      ))}
    </div>
  );
}

const HOME_FAQS: Faq[] = [
  { q: "Can I keep my existing business number?", a: "Yes. Start a number transfer from your account. The transfer finishes after the carrier approves it." },
  { q: "Can my team use desk phones and mobile apps?", a: "Yes. A compatible desk phone can be connected, and the phone app works on a computer or a mobile phone." },
  { q: "What happens when I use my included minutes?", a: "Each plan includes outbound minutes for the billing period. When those are used, you can buy a minute bundle. Bought minutes last until they are used." },
  { q: "Which plan includes the AI receptionist?", a: "Small Business and Team include the receptionist when that feature is turned on for the plan." },
];

const AI_FAQS: Faq[] = [
  { q: "Can callers speak to a person?", a: "Yes. The receptionist can transfer the call to a person, an extension, or a ring group you set up." },
  { q: "What information can the receptionist answer from?", a: "It answers from the business information you save, such as hours, services, and the approved answers on the account." },
  { q: "What happens outside business hours?", a: "After hours, the receptionist follows the message and routing you set. It can take a message or send the call to voicemail." },
  { q: "Which languages are supported?", a: "Any-language understanding is included only on plans where that feature is turned on." },
  { q: "Which plans include the AI receptionist?", a: "Small Business and Team include it when that feature is turned on for the plan." },
];

const PRICE_FAQS: Faq[] = [
  { q: "Is this price per account or per person?", a: "The monthly price is for the account. It covers the number of people listed on that plan." },
  { q: "Are phone numbers and desk phones included?", a: "The plan includes the calling features listed on the card. A business number has its own rental, and a desk phone is not included in the monthly price." },
  { q: "How do included and purchased minutes work?", a: "Each plan includes outbound minutes for the billing period. Extra minutes can be bought as bundles and last until they are used." },
  { q: "What AI usage and languages are included?", a: "The AI receptionist is included on plans that list it. Any-language understanding is included only when that feature is turned on for the plan." },
  { q: "How do upgrades and downgrades affect billing?", a: "Changing plans starts a new payment for that plan’s monthly price. The account uses the new plan after the payment is confirmed." },
];

function FaqBlock({ faqs, cards = false, startClosed = false }: { faqs: Faq[]; cards?: boolean; startClosed?: boolean }) {
  return (
    <div className={cards ? "pub-faq cards" : "pub-faq"}>
      {faqs.map((faq, index) => (
        <details key={faq.q} open={!cards && !startClosed && index === 0}>
          <summary>{faq.q} <Icon name={startClosed ? "plus" : "arrowdown"} size={16} /></summary>
          <p>{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

export function PublicHome({ page, services, plans, faqs }: { page: Record<string, unknown>; services: Service[]; plans: Plan[]; faqs: Faq[]; showDemo?: boolean }) {
  const lowest = pricedPlans(plans)[0];
  void services;
  void faqs;
  return (
    <main>
      <section className="pub-hero home-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">Business calling, connected</p>
            <h1>Your business phone system. <span className="accent">Your AI receptionist. One place.</span></h1>
            <p>Bring your business number, team extensions, desk phones and AI call handling together with SautiCall.</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href="/pricing">View plans</Link>
              <Link className="btn btn-secondary" href="/contact">Talk to us</Link>
            </div>
            <p className="pub-fine">{lowest ? `Plans from ${wholeMoney(lowest.price)}/month` : "Plans"} · Number rental and other charges may apply.</p>
          </div>
          <figure className="home-shot">
            <img src="/marketing/home-hero.png" alt="Product preview of SautiCall on a laptop, a desk phone, and a mobile phone" />
          </figure>
        </div>
      </section>
      <section>
        <div className="wrap home-strip">
          {[
            ["phone", "Business numbers", "Local or toll-free numbers for your business."],
            ["users", "Team extensions", "Keep your team connected in one system."],
            ["bot", "AI call handling", "Greet, answer and route calls automatically."],
            ["settings", "One account", "Manage numbers, users and settings together."],
          ].map(([icon, title, body]) => (
            <article key={title}>
              <span className="feature-ico blue"><Icon name={icon} size={18} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section home-block">
        <div className="wrap">
          <div className="home-head">
            <h2 className="section-title">Everything your calls need, working together.</h2>
            <p>Call queues and reporting on eligible plans.</p>
          </div>
          <div className="home-cards">
            <article><h3>A phone system for your whole team</h3><p>Give everyone an extension, set business hours and keep your team in sync.</p><img src="/marketing/card-team.png" alt="" /><Link href="/solutions#phone">Learn more →</Link></article>
            <article><h3>A helpful first answer</h3><p>Let your AI receptionist answer routine questions, take messages and route calls to the right person.</p><img src="/marketing/card-wave.png" alt="" /><Link href="/ai-receptionist">Learn more →</Link></article>
            <article><h3>Keep your business number</h3><p>Bring your existing number or get a new one. We&apos;ll help you transfer it.</p><img src="/marketing/card-number.png" alt="" /><Link href="/solutions#numbers">Learn more →</Link></article>
            <article><h3>Work from desk or mobile</h3><p>Use desk phones at the office or our mobile and desktop apps on the go.</p><img src="/marketing/card-desk.png" alt="" /><Link href="/solutions#phones">Learn more →</Link></article>
          </div>
        </div>
      </section>
      <section className="section pub-dark home-dark">
        <div className="wrap home-dark-grid">
          <div>
            <p className="pub-kicker">AI receptionist</p>
            <h2>Give every caller a clear next step.</h2>
            <p>Let your AI receptionist answer routine questions, take messages and connect callers to your team.</p>
            <ul className="pub-list light">
              <li>Business-specific answers</li>
              <li>Human handoff</li>
              <li>Voicemail when needed</li>
            </ul>
            <p><Link className="btn btn-coral" href="/ai-receptionist">Explore AI receptionist</Link></p>
            <p className="pub-fine light">Features and supported languages vary by plan.</p>
          </div>
          <img className="home-flow-img" src="/marketing/home-flow.png" alt="An incoming call reaches the AI receptionist, then connects to the team, a person, or voicemail." />
        </div>
      </section>
      <section className="section home-setup">
        <div className="wrap setup-layout">
          <img className="setup-art-img" src="/marketing/setup-art.png" alt="" />
          <div>
            <h2 className="section-title">Tell us what you need. We&apos;ll help you find a setup.</h2>
            <form className="setup-ask" action="/how-it-works">
              <input name="prompt" defaultValue="We're a team of four. We need a business number and call routing." aria-label="Describe the setup you need" />
              <button className="btn btn-primary" type="submit">Find my setup</button>
            </form>
            <div className="setup-steps">
              <div><b>1</b><strong>Choose a plan</strong><span>Pick the right plan for your team.</span></div>
              <span aria-hidden="true">→</span>
              <div><b>2</b><strong>Connect your number</strong><span>Bring your existing number or get a new one.</span></div>
              <span aria-hidden="true">→</span>
              <div><b>3</b><strong>Set up your team</strong><span>Add team members and configure call handling.</span></div>
            </div>
            <p className="pub-fine">Review your setup before activation. Number transfers follow carrier approval.</p>
          </div>
        </div>
      </section>
      <section className="section home-price" id="plans">
        <div className="wrap">
          <h2>A plan for the way you work.</h2>
          <p>Compare team size, included outbound minutes and features.</p>
          <PublicPlans plans={plans} home />
          <p className="home-custom">Need a custom setup? <Link href="/custom">Talk to us →</Link></p>
        </div>
      </section>
      <section className="section home-faq">
        <div className="wrap"><h2>Frequently asked questions.</h2><FaqBlock faqs={HOME_FAQS} cards /></div>
      </section>
      <section className="home-end">
        <div className="wrap">
          <h2>Make your next hello a better one.</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href="/account/register">Get started</Link>
            <Link className="btn btn-ghost" href="/contact">Talk to us</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicSolutions({ page, services }: { page: Record<string, unknown>; services: Service[] }) {
  void services;
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{str(page, "eyebrow", "Solutions")}</p>
            <h1>The right tools for every business call.</h1>
            <p>{str(page, "lead", "Connect your numbers, team and call handling in one SautiCall account.")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href="#phone">Explore solutions</Link>
              <Link className="btn btn-secondary" href="/pricing">Compare plans</Link>
            </div>
          </div>
          <figure className="home-shot"><img src="/marketing/solutions-hero.png" alt="SautiCall on a laptop, a mobile phone, and a desk phone" /></figure>
        </div>
      </section>
      <section className="section tight">
        <div className="wrap">
          <h2 className="center">What would you like to do?</h2>
          <div className="do-row">
            {[
              ["phone", "Set up business calling", "#phone"],
              ["users", "Connect my team", "#phones"],
              ["bot", "Answer with AI", "/ai-receptionist"],
              ["headset", "Manage more calls", "#center"],
              ["globe", "Keep my number", "#numbers"],
            ].map(([icon, label, href]) => (
              <Link key={label} className="do-tile" href={href}><span className="pub-ico round"><Icon name={icon} size={18} /></span><span>{label}</span></Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section" id="phone">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">Cloud phone system</p>
            <h2>Bring your team onto one phone system.</h2>
            <p>Manage extensions, business hours, voicemail and call routing from your account.</p>
            <ul className="pub-list"><li>Team extensions</li><li>Business hours and routing</li><li>Voicemail and forwarding</li></ul>
            <Link className="btn btn-secondary" href="/pricing">Compare phone system plans</Link>
          </div>
          <ExtTable />
        </div>
      </section>
      <section className="section alt" id="phones">
        <div className="wrap pub-split">
          <DevicePair />
          <div>
            <p className="pub-kicker">Desk phones & softphones</p>
            <h2>At your desk. On the move. Still your business.</h2>
            <p>Use supported desk phones and softphone apps to stay connected to your business calling setup.</p>
            <Link href="/contact">Check device compatibility →</Link>
          </div>
        </div>
      </section>
      <section className="section pub-dark" id="ai">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">AI receptionist</p>
            <h2>A helpful first answer for your callers.</h2>
            <p>Answer routine questions, take messages and route callers to your team.</p>
            <ul className="pub-list light"><li>Answers</li><li>Messages</li><li>Human handoff</li></ul>
            <Link className="btn btn-coral" href="/ai-receptionist">Explore AI receptionist</Link>
          </div>
          <AiCallCard />
        </div>
      </section>
      <section className="section" id="center">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">Virtual contact center</p>
            <h2>Give busy teams a clearer way to handle calls.</h2>
            <p>Organize shared calls with ring groups, queues and reporting on eligible plans.</p>
            <ul className="pub-list"><li>Ring groups and call transfers</li><li>Call queues</li><li>Call reporting</li></ul>
            <Link className="btn btn-secondary" href="/pricing">Explore team plans</Link>
          </div>
          <QueueCard />
        </div>
      </section>
      <section className="section alt" id="numbers">
        <div className="wrap">
          <p className="pub-kicker">Numbers & porting</p>
          <h2>A new number. Or the one your customers know.</h2>
          <NumberPair />
          <p className="pub-fine">Number availability, transfer eligibility and activation depend on carrier approval and service setup.</p>
          <div className="pub-actions">
            <Link className="btn btn-secondary" href="/account/register">Explore business numbers</Link>
            <Link href="/account/porting">Learn about number transfers →</Link>
          </div>
        </div>
      </section>
      <section className="unsure" id="porting">
        <div className="wrap">
          <div>
            <h2>Not sure where to start?</h2>
            <p>Describe the calls you want handled. The setup assistant can suggest a configuration for you to review.</p>
          </div>
          <Link className="btn btn-primary" href="/how-it-works">Find my setup</Link>
        </div>
      </section>
      <section className="pub-end">
        <div className="wrap">
          <h2>Build the phone setup your business needs.</h2>
          <div className="pub-actions">
            <Link className="btn btn-secondary" href="/pricing">Compare plans</Link>
            <Link className="btn btn-primary" href="/contact">Talk to us</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicAi({ page, plans, faqs }: { page: Record<string, unknown>; plans: Plan[]; faqs: Faq[] }) {
  void page;
  void plans;
  void faqs;
  return (
    <main>
      <section className="ai-hero">
        <div className="wrap ai-hero-grid">
          <div>
            <p className="pub-kicker">AI receptionist</p>
            <h1>A warm welcome.<br /><span className="accent">A clear next step.</span></h1>
            <p>Greet callers, answer approved business questions, take messages and connect people to your team.</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href="/pricing">View AI-enabled plans</Link>
              <Link className="btn btn-secondary" href="/contact">Talk to us</Link>
            </div>
          </div>
          <div className="ai-photo">
            <img src="/marketing/ai-caller.jpg" alt="A caller on the phone with the business" />
            <article className="ai-example">
              <header>Example call <Icon name="arrowdown" size={14} /></header>
              <div className="ai-line"><span className="feature-ico blue"><Icon name="bot" size={14} /></span><div><b>AI receptionist</b><small>Thanks for calling. How can I help?</small></div></div>
              <div className="ai-line"><span className="feature-ico violet"><Icon name="users" size={14} /></span><div><b>Caller</b><small>Can I speak to sales?</small></div></div>
              <div className="ai-line result"><span className="feature-ico green"><Icon name="arrow" size={14} /></span><div><b>Result</b><small>Transfer to Sales · Extension 514</small></div></div>
            </article>
          </div>
        </div>
        <div className="wrap ai-points">
          {[
            ["blue", "phone", "Welcome callers", "A friendly, consistent greeting for every call."],
            ["blue", "message", "Answer routine questions", "Share approved information about your business."],
            ["amber", "mic", "Capture messages", "Take messages with key details when needed."],
            ["amber", "users", "Connect your team", "Transfer callers to the right person or department."],
          ].map(([tone, icon, title, body]) => (
            <article key={title}>
              <span className={`feature-ico ${tone}`}><Icon name={icon} size={16} /></span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </article>
          ))}
        </div>
      </section>
      <section className="section ai-unfold">
        <div className="wrap">
          <p className="pub-kicker">See how a call can unfold</p>
          <h2>Your business information and routing rules guide each step.</h2>
          <div className="ai-flow">
            <article><span className="feature-ico amber"><Icon name="phone" size={16} /></span><b>Incoming caller</b><small>A customer calls your business.</small></article>
            <span className="ai-dots" aria-hidden="true" />
            <article><span className="feature-ico blue"><Icon name="bot" size={16} /></span><b>AI receptionist</b><small>Thanks for calling. How can I help?</small></article>
            <span className="ai-dots" aria-hidden="true" />
            <div>
              <article><span className="feature-ico green"><Icon name="message" size={16} /></span><div><b>Answer a question</b><small>Provide information from your approved answers.</small></div></article>
              <article><span className="feature-ico amber"><Icon name="users" size={16} /></span><div><b>Connect to a person</b><small>Transfer to the right team or extension.</small></div></article>
              <article><span className="feature-ico blue"><Icon name="mic" size={16} /></span><div><b>Take a message</b><small>Capture caller details and their reason for call.</small></div></article>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2 className="center">Built around your business.</h2>
          <div className="ai-built">
            <article className="tint-blue">
              <span className="feature-ico blue"><Icon name="message" size={16} /></span>
              <h3>Your approved answers</h3>
              <p>Use your business information to answer common questions.</p>
              <dl>
                <div><dt>Business name</dt><dd>Riverside Dental</dd></div>
                <div><dt>Business hours</dt><dd>Mon – Fri, 8:00 am – 5:00 pm</dd></div>
                <div><dt>Address</dt><dd>123 Maple Ave, Riverton</dd></div>
                <div><dt>Services</dt><dd>General, Cosmetic, Emergency</dd></div>
              </dl>
            </article>
            <article className="tint-peach">
              <span className="feature-ico amber"><Icon name="users" size={16} /></span>
              <h3>Your transfer destinations</h3>
              <p>Send callers to the right person or department.</p>
              <dl>
                <div><dt>Sales</dt><dd>Extension 514</dd></div>
                <div><dt>Support</dt><dd>Extension 515</dd></div>
              </dl>
            </article>
            <article className="tint-blue">
              <span className="feature-ico blue"><Icon name="mic" size={16} /></span>
              <h3>Your message preferences</h3>
              <p>Choose what details to capture when a message is taken.</p>
              <dl>
                <div><dt>Caller&apos;s name</dt><dd>Alex Carter</dd></div>
                <div><dt>Phone number</dt><dd>(555) 123-4567</dd></div>
                <div><dt>Reason for call</dt><dd>Interested in appointment availability.</dd></div>
              </dl>
            </article>
          </div>
        </div>
      </section>
      <section className="section ai-choose">
        <div className="wrap pub-split">
          <div>
            <h2>You choose how it answers.</h2>
            <p>Configure the greeting, approved information and transfer rules from your SautiCall account.</p>
            <ul className="pub-list">
              <li>Customize your greeting</li>
              <li>Choose where calls are transferred</li>
              <li>Set after-hours behavior</li>
            </ul>
          </div>
          <div className="ai-settings">
            <header><b>AI receptionist settings</b><span>Draft</span></header>
            <div className="set-grid">
              <nav>
                <span className="on">Greeting</span>
                <span>Business information</span>
                <span>Transfer rules</span>
                <span>Message settings</span>
                <span>After-hours</span>
              </nav>
              <div>
                <label>Greeting<small>This is what callers will hear when they call your business.</small></label>
                <p className="greet">Thanks for calling Riverside Dental. How can I help you today? <em>62/250</em></p>
                <label>Business hours</label>
                <p className="hours"><span>Mon – Fri</span><span>8:00 am</span><span>to</span><span>5:00 pm</span></p>
                <div className="ai-set-actions">
                  <Link className="btn btn-secondary" href="/account/register?product=ai">Preview greeting</Link>
                  <Link className="btn btn-primary" href="/account/register?product=ai">Review changes</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap ai-lang">
          <div className="ai-globe" aria-hidden="true">
            <span>Hello</span><span>Hola</span><span>Bonjour</span><span>こんにちは</span>
            <i />
          </div>
          <div>
            <h2>Help callers in supported languages.</h2>
            <p>Check available languages and plan eligibility before choosing your setup.</p>
            <p><Link href="/pricing">Ask about language support →</Link></p>
          </div>
        </div>
      </section>
      <section className="section ai-setup-sec">
        <div className="wrap">
          <h2 className="center">From setup to your first test call.</h2>
          <div className="ai-steps">
            <div><b>1</b><strong>Choose an AI-enabled plan</strong><span>Select a plan that includes the AI receptionist.</span></div>
            <div><b>2</b><strong>Add your business information</strong><span>Provide your approved answers and details.</span></div>
            <div><b>3</b><strong>Set transfer and message rules</strong><span>Choose where to transfer calls and what to capture.</span></div>
            <div><b>4</b><strong>Test before activation</strong><span>Make a test call to confirm the experience.</span></div>
          </div>
          <p className="pub-fine center">An active number and completed service setup are required for live calls.</p>
          <div className="ai-finder">
            <form action="/account/register" method="get">
              <h2>Find the right AI-enabled plan.</h2>
              <input type="hidden" name="product" value="ai" />
              <div>
                <label>Team size
                  <select name="people" defaultValue="5">
                    <option value="1">1 person</option>
                    <option value="5">Up to 5 people</option>
                    <option value="10">Up to 10 people</option>
                  </select>
                </label>
                <label>Preferred caller language
                  <select name="language" defaultValue="">
                    <option value="">Select a language</option>
                    <option value="1">Any language</option>
                  </select>
                </label>
              </div>
              <button className="btn btn-primary" type="submit">See matching plans</button>
            </form>
            <aside>
              <span className="feature-ico blue"><Icon name="message" size={16} /></span>
              <h3>Review your recommendation</h3>
              <p>Compare included features, usage allowances and total pricing before you continue.</p>
              <Link href="/account/login">Already a customer? Sign in to configure →</Link>
            </aside>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap ai-faq">
          <h2>Frequently asked questions.</h2>
          <FaqBlock faqs={AI_FAQS} cards />
        </div>
      </section>
      <section className="ai-end">
        <div className="wrap">
          <h2>Give your callers a better first hello.</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href="/pricing">View plans</Link>
            <Link className="btn btn-ghost" href="/contact">Talk to us</Link>
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
  void faqs;
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap center">
          <p className="pub-kicker">{str(page, "eyebrow", "Plans & pricing")}</p>
          <h1>{str(page, "title", "Choose the right fit")} {str(page, "titleEm", "for your business calls.")}</h1>
          <p>{str(page, "lead", "Compare team capacity, outbound minutes and the features your business needs.")}</p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <PublicPlans plans={plans} verb="Explore" period />
          <p className="pub-fine">Desk phone support means a compatible phone can be connected. The phone itself is not included in the monthly price.</p>
          <div className="pub-note"><span><b>Need a different setup?</b> Discuss team size, call handling and specific requirements.</span><Link className="btn btn-coral" href="/custom">Request a custom quote</Link></div>
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
                    const seats = plan.seats && plan.seats > 0 ? plan.seats : 1;
                    const value = row.seats ? (seats === 1 ? "1" : `Up to ${seats}`) : row.minutes ? plan.includedMinutes.toLocaleString("en-US") : allowed ? "✓" : "—";
                    const hours = row.key === "business_hours" ? planAllows(plan, "business_hours") && planAllows(plan, "ring_groups") : true;
                    return <td key={plan.name}>{row.key === "business_hours" ? (hours ? "✓" : "—") : value}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>Understand the full cost.</h2>
          <div className="pub-grid-4">
            {[
              ["phone", "Business numbers", "Number rental and any setup charges are shown when selecting a number."],
              ["shield", "Emergency calling", "Applicable emergency registration or recurring charges must be disclosed before purchase."],
              ["bot", "AI usage & languages", "Review supported languages, usage allowances and any additional AI charges."],
              ["card", "Taxes & calling rates", "Review taxes, eligible destinations and charges outside included allowances."],
            ].map(([icon, title, body]) => (
              <article key={title} className="pub-card"><span className="cost-ico"><Icon name={icon} size={16} /></span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>
      {bundles.length > 0 ? (
        <section className="section">
          <div className="wrap">
            <h2>Need more outbound minutes?</h2>
            <div className="pub-grid-3">
              {bundles.map((bundle) => (
                <article key={bundle.name} className="pub-card bundle-card">
                  <span className="cost-ico"><Icon name="phone" size={16} /></span>
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
          <div className="finder-row">
            <div><h2>Not sure which plan fits?</h2><p>Tell us a bit about your needs and we&apos;ll suggest a plan.</p></div>
            <form className="finder" action="/account/register" method="get">
              <label>Team size
                <select name="people" defaultValue="5">
                  <option value="1">1 person</option>
                  <option value="5">Up to 5 people</option>
                  <option value="10">Up to 10 people</option>
                </select>
              </label>
              <label className="check-option"><input type="checkbox" name="ai" value="1" /> I need AI call answering</label>
              <span>
                <button className="btn btn-primary" type="submit">Find a suitable plan</button>
                <p className="pub-fine">Review the recommendation before continuing.</p>
              </span>
            </form>
          </div>
        </div>
      </section>
      <section className="section"><div className="wrap"><h2>Frequently asked questions.</h2><FaqBlock faqs={PRICE_FAQS} startClosed /></div></section>
      <section className="price-end">
        <div className="wrap">
          <h2>Let&apos;s find the right plan for your team.</h2>
          <div className="pub-actions">
            <Link className="btn btn-coral" href="/contact">Talk to us</Link>
            <Link className="btn btn-navy" href="/solutions">Explore solutions</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicHow({ home, plans, showDemo }: { home: Record<string, unknown>; plans: Plan[]; showDemo: boolean }) {
  const sample = str(home, "chatSampleUser");
  const steps = [
    ["1", "Tell us what you need", "How many people answer calls, where those calls should go, and whether you want the AI receptionist."],
    ["2", "Review the suggested plan", "See the people, outbound minutes, and features on the plan that matches what you described."],
    ["3", "Create your account and pay", "You review the monthly price first. The plan starts after that payment is confirmed."],
    ["4", "Connect a number and your team", "Choose a new number or transfer one you already use, then add the people who answer."],
  ];
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">How it works</p>
            <h1>Tell us what you need. We&apos;ll set it up with you.</h1>
            <p>Describe the calls you want handled. Review a real plan, create your account, and connect a number and your team.</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href="#assistant">Start with the assistant</Link>
              <Link className="btn btn-secondary" href="/pricing">Compare plans</Link>
            </div>
          </div>
          <img className="how-mark" src="/marketing/setup-check.png" alt="" />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>Four steps from the first description to a working line.</h2>
          <div className="pub-steps">
            {steps.map(([n, title, body]) => <div key={n}><b>{n}</b><strong>{title}</strong><p>{body}</p></div>)}
          </div>
        </div>
      </section>
      <section className="section alt" id="assistant">
        <div className="wrap how-assist">
          <div>
            <p className="pub-kicker">Setup assistant</p>
            <h2>Describe the phone system in everyday language.</h2>
            <p>The assistant matches your description to a published plan. You still review the price and features before you pay.</p>
          </div>
          {showDemo ? (
            <SetupAssistant
              title={str(home, "chatTitle", "SautiCall Setup Assistant")}
              sub={str(home, "chatSub", "Matches your description to a plan you can subscribe to")}
              status={str(home, "chatStatus", "Ready")}
              placeholder={str(home, "chatPlaceholder", "Tell us about your team and calls")}
              hello={str(home, "chatHello", "Tell me how you would like your business calls to work.")}
              proposal={str(home, "chatProposal", "Recommended setup")}
              sample={sample}
              initial={sample ? recommendPlan(plans, sample) : null}
            />
          ) : <p><Link className="btn btn-primary" href="/account/register">Create account</Link></p>}
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-grid-3">
          <article className="pub-card"><span className="cost-ico"><Icon name="checkcircle" size={16} /></span><h3>You review it first</h3><p>The suggested plan, minutes, and features are the ones on the pricing page. Nothing is charged until you confirm payment.</p></article>
          <article className="pub-card"><span className="cost-ico"><Icon name="calendar" size={16} /></span><h3>Requests stay in your account</h3><p>Number orders and transfers show their status. A person steps in when a carrier step needs one.</p></article>
          <article className="pub-card"><span className="cost-ico"><Icon name="users" size={16} /></span><h3>Then add your team</h3><p>After the plan is paid, add the people who answer. Each person gets an extension on your phone system.</p></article>
        </div>
      </section>
      <section className="home-end">
        <div className="wrap">
          <h2>Ready to set up your business calls?</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href="/account/register">Get started</Link>
            <Link className="btn btn-ghost" href="/contact">Talk to us</Link>
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
  scene = "desk",
  art,
}: {
  title: React.ReactNode;
  lead: string;
  kicker: string;
  children: React.ReactNode;
  points?: string[];
  step?: "account" | "code";
  scene?: "desk" | "calls";
  art?: string;
}) {
  return (
    <main>
      <div className="pub-authbar">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span className="mark-wave" /><span className="mark-wave" /><span className="mark-wave" /></span>SautiCall</Link>
        <nav>
          <Link href="/">Back to website →</Link>
          <Link href="/contact">Need help?</Link>
        </nav>
      </div>
      <div className="pub-auth-grid">
        <section className="pub-auth-side">
          <h1>{title}</h1>
          <p>{lead}</p>
          <div className="auth-art">{art ? <img src={art} alt="" /> : scene === "calls" ? <CallsMock /> : <DeskMock />}</div>
          {points ? <div className="pub-checks">{points.map((point) => {
            const icon = /account/i.test(point) ? "users" : /guided|setup/i.test(point) ? "settings" : "checkcircle";
            return <div key={point}><span><Icon name={icon} size={18} /></span>{point}</div>;
          })}</div> : null}
          <p className="pub-legal"><span>© 2026 SautiCall</span><Link href="/contact">Help</Link></p>
        </section>
        <section className="pub-auth-main">
          <p className="pub-kicker">{kicker}</p>
          {step === "account" ? (
            <div className="pub-steps-line"><span className="n on">1</span><span className="on">Account</span><span>—</span><span className="n">2</span><span>Plan & payment</span></div>
          ) : null}
          {children}
        </section>
      </div>
    </main>
  );
}
