import { Fragment } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { SetupAssistant } from "./Interactive";
import { CallsMock, DeskMock } from "./PublicMocks";
import { copyFaqs, copyLine, copyRows, copyTexts } from "@/lib/public-copy";
import { recommendPlan } from "@/lib/setup-assistant";
import { perMinute, wholeMoney } from "@/lib/account-display";
import { normalizePlan, planAllows, type FeatureKey } from "@/lib/plan-features";
import { planSignupPath } from "@/lib/signup";
import type { Faq, Plan, Service } from "@/lib/types";

function str(page: Record<string, unknown>, key: string, fallback = "") {
  const value = page[key];
  return typeof value === "string" && value ? value : fallback;
}

function t(page: Record<string, unknown>, doc: string, key: string) {
  return copyLine(page, doc, key);
}

function pricedPlans(plans: Plan[]) {
  return plans.filter((plan) => !plan.custom && plan.price > 0).map((plan) => normalizePlan(plan)).sort((a, b) => a.price - b.price);
}

const BLURB: Record<string, string> = {
  Solo: "For one-person businesses.",
  "Small Business": "For small teams.",
  Team: "For busier teams.",
};

function fillCount(template: string, count: string) {
  return template.replace("{count}", count);
}

function cardLines(plan: Plan, period: boolean, phrases: Record<string, string>) {
  const seats = plan.seats && plan.seats > 0 ? plan.seats : 1;
  const people = seats === 1 ? phrases.peopleOne || "1 person" : fillCount(phrases.peopleMany || "Up to {count} people", String(seats));
  const minutes = fillCount(period ? phrases.minutesPeriod || "{count} outbound minutes per plan period" : phrases.minutes || "{count} outbound minutes", plan.includedMinutes.toLocaleString("en-US"));
  const has = (key: FeatureKey) => planAllows(plan, key);
  if (plan.name === "Team" && has("queues")) {
    return [
      ["users", people],
      ["phone", minutes],
      ["check", phrases.inherit || "Everything in Small Business"],
      ["check", phrases.queues || "Call queues"],
      ["check", phrases.reporting || "Call reporting"],
    ];
  }
  if (plan.name === "Small Business") {
    const desk = period ? phrases.deskSupport || "Desk phone support" : phrases.desk || "Desk phones";
    return [
      ["users", people],
      ["phone", minutes],
      ["check", desk],
      ["check", phrases.hours || "Business hours"],
      ["check", phrases.rings || "Ring groups"],
      ["check", phrases.ai || "AI receptionist"],
    ].filter((item) => item[0] !== "check" || (item[1] === desk ? has("desk_phones") : item[1] === (phrases.ai || "AI receptionist") ? has("ai") : true));
  }
  return [
    ["users", people],
    ["phone", minutes],
    ...(has("softphone") ? [["check", phrases.softphone || "Softphones"]] : []),
    ...(has("voicemail") ? [["check", phrases.voicemail || "Voicemail & forwarding"]] : []),
  ];
}

export function PublicPlans({ plans, verb = "Choose", period = false, home = false, ribbon = "", blurbs = [], phrases = {} }: { plans: Plan[]; verb?: string; period?: boolean; home?: boolean; ribbon?: string; blurbs?: { name: string; text: string }[]; phrases?: Record<string, string> }) {
  const ordered = pricedPlans(plans);
  const month = phrases.month || "/ month";
  return (
    <div className={home ? "pub-plans home-plans" : "pub-plans"}>
      {ordered.map((plan) => (
        <article key={plan.name} className={plan.popular ? "popular" : ""}>
          {home && plan.popular ? <span className="home-ribbon">{ribbon || "For small teams"}</span> : null}
          <div className="ws-split"><h3>{plan.name}</h3>{!home && plan.popular ? <span className="pub-ribbon">{ribbon || "Best for most teams"}</span> : null}</div>
          {home ? null : <p>{blurbs.find((item) => item.name === plan.name)?.text || BLURB[plan.name] || plan.desc}</p>}
          <p className="pub-price">{wholeMoney(plan.price)} <small>{month}</small></p>
          <ul>
            {cardLines(plan, period, phrases).map(([kind, line]) => (
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
  const say = (key: string) => t(page, "page.home", key);
  void services;
  void faqs;
  const stripIcons = ["phone", "users", "bot", "settings"];
  const cardArt = ["/marketing/card-team.png", "/marketing/card-wave.png", "/marketing/card-number.png", "/marketing/card-desk.png"];
  const phrases = Object.fromEntries(["inherit", "queues", "reporting", "desk", "deskSupport", "hours", "rings", "ai", "softphone", "voicemail", "peopleOne", "peopleMany", "minutes", "minutesPeriod", "month"].map((key) => [key, t(page, "page.pricing", key)]));
  return (
    <main>
      <section className="pub-hero home-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{say("kicker")}</p>
            <h1>{say("title")} <span className="accent">{say("titleAccent")}</span></h1>
            <p>{say("lead")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href={say("primaryHref")}>{say("primaryCta")}</Link>
              <Link className="btn btn-secondary" href={say("secondaryHref")}>{say("secondaryCta")}</Link>
            </div>
            <p className="pub-fine">{lowest ? say("plansFrom").replace("{price}", wholeMoney(lowest.price)) : "Plans"} · {say("fineNote")}</p>
          </div>
          <figure className="home-shot">
            <img src="/marketing/home-hero.png" alt={say("heroAlt")} />
          </figure>
        </div>
      </section>
      <section>
        <div className="wrap home-strip">
          {copyRows(page, "page.home", "strip").map((item, index) => (
            <article key={item.title}>
              <span className="feature-ico blue"><Icon name={stripIcons[index] || "phone"} size={18} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section home-block">
        <div className="wrap">
          <div className="home-head">
            <h2 className="section-title">{say("togetherTitle")}</h2>
            <p>{say("togetherBody")}</p>
          </div>
          <div className="home-cards">
            {copyRows(page, "page.home", "cards").map((item, index) => (
              <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p><img src={cardArt[index] || cardArt[0]} alt="" /><Link href={item.href}>{item.link}</Link></article>
            ))}
          </div>
        </div>
      </section>
      <section className="section pub-dark home-dark">
        <div className="wrap home-dark-grid">
          <div>
            <p className="pub-kicker">{say("aiKicker")}</p>
            <h2>{say("aiTitle")}</h2>
            <p>{say("aiBody")}</p>
            <ul className="pub-list light">
              {copyTexts(page, "page.home", "aiPoints").map((point) => <li key={point}>{point}</li>)}
            </ul>
            <p><Link className="btn btn-coral" href={say("aiHref")}>{say("aiCta")}</Link></p>
            <p className="pub-fine light">{say("aiFine")}</p>
          </div>
          <img className="home-flow-img" src="/marketing/home-flow.png" alt={say("aiAlt")} />
        </div>
      </section>
      <section className="section home-setup">
        <div className="wrap setup-layout">
          <img className="setup-art-img" src="/marketing/setup-art.png" alt="" />
          <div>
            <h2 className="section-title">{say("setupTitle")}</h2>
            <form className="setup-ask" action="/how-it-works">
              <input name="prompt" defaultValue={say("setupPrompt")} aria-label={say("setupTitle")} />
              <button className="btn btn-primary" type="submit">{say("setupButton")}</button>
            </form>
            <div className="setup-steps">
              {copyRows(page, "page.home", "setupSteps").map((item, index) => (
                <Fragment key={item.title}>
                  {index > 0 ? <span aria-hidden="true">→</span> : null}
                  <div><b>{index + 1}</b><strong>{item.title}</strong><span>{item.body}</span></div>
                </Fragment>
              ))}
            </div>
            <p className="pub-fine">{say("setupFine")}</p>
          </div>
        </div>
      </section>
      <section className="section home-price" id="plans">
        <div className="wrap">
          <h2>{say("priceTitle")}</h2>
          <p>{say("priceBody")}</p>
          <PublicPlans plans={plans} home ribbon={say("ribbon")} phrases={phrases} />
          <p className="home-custom">{say("customLead")} <Link href={say("customHref")}>{say("customCta")}</Link></p>
        </div>
      </section>
      <section className="section home-faq">
        <div className="wrap"><h2>{say("faqTitle")}</h2><FaqBlock faqs={copyFaqs(page, "page.home")} cards /></div>
      </section>
      <section className="home-end">
        <div className="wrap">
          <h2>{say("endTitle")}</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href={say("endHref")}>{say("endCta")}</Link>
            <Link className="btn btn-ghost" href={say("endSecondaryHref")}>{say("endSecondary")}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicSolutions({ page, services }: { page: Record<string, unknown>; services: Service[] }) {
  void services;
  const say = (key: string) => t(page, "page.solutions", key);
  const choiceIcons = ["phone", "users", "wave", "chart", "hash"];
  return (
    <main className="sol">
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{say("kicker")}</p>
            <h1>{say("title")}</h1>
            <p>{say("lead")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href={say("primaryHref")}>{say("primaryCta")}</Link>
              <Link className="btn btn-secondary" href={say("secondaryHref")}>{say("secondaryCta")}</Link>
            </div>
          </div>
          <figure className="home-shot"><img src="/marketing/solutions-hero.png" alt={say("heroAlt")} /></figure>
        </div>
      </section>
      <nav className="sol-jump" aria-label="On this page">
        {copyRows(page, "page.solutions", "jumps").map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </nav>
      <section className="section tight">
        <div className="wrap">
          <h2 className="center">{say("chooseTitle")}</h2>
          <div className="sol-do">
            {copyRows(page, "page.solutions", "choices").map((item, index) => (
              <Link key={item.label} href={item.href}><Icon name={choiceIcons[index] || "phone"} size={20} /><span>{item.label}</span><Icon name="arrow" size={16} /></Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section" id="phone">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">{say("phoneKicker")}</p>
            <h2>{say("phoneTitle")}</h2>
            <p>{say("phoneBody")}</p>
            <ul className="sol-list">{copyTexts(page, "page.solutions", "phonePoints").map((point) => <li key={point}><Icon name="checkcircle" size={16} /> {point}</li>)}</ul>
            <Link className="sol-link" href={say("phoneHref")}>{say("phoneLink")} <Icon name="arrow" size={16} /></Link>
          </div>
          <article className="sol-ext" aria-hidden="true">
            <aside>
              <b><i /> SautiCall</b>
              {[["home", "Home"], ["phone", "Calls"], ["users", "Extensions"], ["hash", "Numbers"], ["bot", "AI receptionist"], ["headset", "Contact center"], ["settings", "Settings"]].map(([icon, label]) => (
                <span key={label} className={label === "Extensions" ? "on" : ""}><Icon name={icon} size={14} /> {label}</span>
              ))}
            </aside>
            <div>
              <header><strong>Extensions</strong><span>Add extension</span></header>
              <div className="sol-ext-head"><span>Ext</span><span>Name</span><span>Status</span></div>
              {[["511", "Main Line", "Online", "ok"], ["512", "Support", "Online", "ok"], ["514", "Sales", "Away", "away"]].map(([ext, name, state, tone]) => (
                <div key={ext}><span>{ext}</span><span>{name}</span><em className={tone}>{state}</em></div>
              ))}
            </div>
          </article>
        </div>
      </section>
      <section className="section sol-soft" id="phones">
        <div className="wrap pub-split">
          <img className="sol-desk" src="/marketing/solutions-desk.png" alt={say("deskAlt")} />
          <div>
            <p className="pub-kicker">{say("deskKicker")}</p>
            <h2>{say("deskTitle")}</h2>
            <p>{say("deskBody")}</p>
            <div className="sol-pills">
              {copyTexts(page, "page.solutions", "deskPills").map((pill, index) => <span key={pill}><Icon name={["phone", "monitor", "smartphone", "globe"][index] || "phone"} size={14} /> {pill}</span>)}
            </div>
            <Link className="sol-link" href={say("deskHref")}>{say("deskLink")} <Icon name="arrow" size={16} /></Link>
          </div>
        </div>
      </section>
      <section className="section sol-navy" id="ai">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">{say("aiKicker")}</p>
            <h2>{say("aiTitle")}</h2>
            <p>{say("aiBody")}</p>
            <div className="sol-inline">
              {copyTexts(page, "page.solutions", "aiPills").map((pill, index) => <span key={pill}><Icon name={["message", "mail", "users"][index] || "message"} size={16} /> {pill}</span>)}
            </div>
            <Link className="btn btn-coral" href={say("aiHref")}>{say("aiCta")}</Link>
          </div>
          <div>
            <article className="sol-ai" aria-hidden="true">
              <div>
                <span>Caller asks a question</span>
                <p>What are your business hours?</p>
                <div><Icon name="wave" size={22} /><div><b>SautiCall AI</b><small>Checking your business hours...</small></div></div>
              </div>
              <ol>
                <li><Icon name="message" size={14} /> Answer common questions</li>
                <li><Icon name="mail" size={14} /> Take a message</li>
                <li><Icon name="users" size={14} /> Route to the right person</li>
              </ol>
            </article>
            <p className="sol-note">{say("aiNote")}</p>
          </div>
        </div>
      </section>
      <section className="section" id="center">
        <div className="wrap pub-split">
          <div>
            <p className="pub-kicker">{say("centerKicker")}</p>
            <h2>{say("centerTitle")}</h2>
            <p>{say("centerBody")}</p>
            <ul className="sol-list">{copyTexts(page, "page.solutions", "centerPoints").map((point) => <li key={point}><Icon name="checkcircle" size={16} /> {point}</li>)}</ul>
            <Link className="sol-link" href={say("centerHref")}>{say("centerLink")} <Icon name="arrow" size={16} /></Link>
          </div>
          <article className="sol-queue" aria-hidden="true">
            <header><b>Support queue</b><em>Live</em></header>
            <div className="wait"><span><Icon name="phone" size={14} /> Waiting</span><b>2</b></div>
            <div className="team"><span><Icon name="users" size={14} /> With team</span><b>3</b></div>
            <header className="sub"><b>Recent calls</b><span>View all</span></header>
            {[["(302) 555-0123", "2 min ago", "Waiting", "wait"], ["(302) 555-0178", "6 min ago", "With team", "team"], ["(302) 555-0140", "12 min ago", "Completed", "done"]].map(([num, when, state, tone]) => (
              <p key={num}><Icon name="phone" size={14} /><span>{num}</span><small>{when}</small><em className={tone}>{state}</em></p>
            ))}
          </article>
        </div>
      </section>
      <section className="section sol-soft" id="numbers">
        <div className="wrap">
          <p className="pub-kicker">{say("numbersKicker")}</p>
          <h2>{say("numbersTitle")}</h2>
          <div className="sol-nums">
            <article>
              <header><span className="cost-ico"><Icon name="phone" size={16} /></span><div><h3>{say("newNumberTitle")}</h3><p>{say("newNumberBody")}</p></div></header>
              <div className="sol-search"><Icon name="search" size={14} /> (302) 555-01</div>
              <p><Icon name="phone" size={14} /> (302) 555-0101 <em>Available</em></p>
              <p><Icon name="phone" size={14} /> (302) 555-0102 <em>Available</em></p>
              <Link className="btn btn-primary" href={say("newNumberHref")}>{say("newNumberCta")}</Link>
            </article>
            <article>
              <header><span className="cost-ico"><Icon name="arrow" size={16} /></span><div><h3>{say("keepNumberTitle")}</h3><p>{say("keepNumberBody")}</p></div></header>
              <div className="sol-steps"><span className="on"><b>1</b><small>Request</small></span><span><b>2</b><small>Review</small></span><span><b>3</b><small>Transfer</small></span><span><b>4</b><small>Activation</small></span></div>
              <Link className="btn btn-primary" href={say("keepNumberHref")}>{say("keepNumberCta")}</Link>
            </article>
          </div>
          <p className="pub-fine center">{say("numbersFine")}</p>
        </div>
      </section>
      <section className="section tight sol-soft" id="porting">
        <div className="wrap">
          <article className="sol-unsure">
            <div>
              <h2><Icon name="spark" size={18} /> {say("unsureTitle")}</h2>
              <p>{say("unsureBody")}</p>
            </div>
            <form action="/how-it-works" method="get">
              <input name="prompt" required maxLength={400} placeholder={say("unsurePlaceholder")} aria-label={say("unsureTitle")} />
              <button className="btn btn-primary" type="submit">{say("unsureButton")}</button>
            </form>
          </article>
        </div>
      </section>
      <section className="sol-end">
        <div className="wrap">
          <h2>{say("endTitle")}</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href={say("endHref")}>{say("endCta")}</Link>
            <Link className="btn btn-ghost" href={say("endSecondaryHref")}>{say("endSecondary")}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicAi({ page, plans, faqs }: { page: Record<string, unknown>; plans: Plan[]; faqs: Faq[] }) {
  void plans;
  void faqs;
  const say = (key: string) => t(page, "page.ai", key);
  const pointIcons = [["blue", "phone"], ["blue", "message"], ["amber", "mic"], ["amber", "users"]];
  return (
    <main>
      <section className="ai-hero">
        <div className="wrap ai-hero-grid">
          <div>
            <p className="pub-kicker">{say("kicker")}</p>
            <h1>{say("title")}<br /><span className="accent">{say("titleAccent")}</span></h1>
            <p>{say("lead")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href={say("primaryHref")}>{say("primaryCta")}</Link>
              <Link className="btn btn-secondary" href={say("secondaryHref")}>{say("secondaryCta")}</Link>
            </div>
          </div>
          <div className="ai-photo">
            <img src="/marketing/ai-caller.jpg" alt={say("heroAlt")} />
            <article className="ai-example">
              <header>Example call <Icon name="arrowdown" size={14} /></header>
              <div className="ai-line"><span className="feature-ico blue"><Icon name="bot" size={14} /></span><div><b>AI receptionist</b><small>Thanks for calling. How can I help?</small></div></div>
              <div className="ai-line"><span className="feature-ico violet"><Icon name="users" size={14} /></span><div><b>Caller</b><small>Can I speak to sales?</small></div></div>
              <div className="ai-line result"><span className="feature-ico green"><Icon name="arrow" size={14} /></span><div><b>Result</b><small>Transfer to Sales · Extension 514</small></div></div>
            </article>
          </div>
        </div>
        <div className="wrap ai-points">
          {copyRows(page, "page.ai", "points").map((item, index) => {
            const [tone, icon] = pointIcons[index] || ["blue", "phone"];
            return [tone, icon, item.title, item.body];
          }).map(([tone, icon, title, body]) => (
            <article key={title}>
              <span className={`feature-ico ${tone}`}><Icon name={icon} size={16} /></span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2 className="center">{say("servicesTitle")}</h2>
          <p className="center">{say("servicesLead")}</p>
          <div className="ai-points">
            {copyRows(page, "page.ai", "services").map((item) => (
              <article key={item.title}>
                <span className="feature-ico blue"><Icon name="spark" size={16} /></span>
                <div><h3>{item.title}</h3><p>{item.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section ai-unfold">
        <div className="wrap">
          <p className="pub-kicker">{say("flowKicker")}</p>
          <h2>{say("flowTitle")}</h2>
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
          <h2 className="center">{say("builtTitle")}</h2>
          <div className="ai-built">
            <article className="tint-blue">
              <span className="feature-ico blue"><Icon name="message" size={16} /></span>
              <h3>{copyRows(page, "page.ai", "built")[0]?.title}</h3>
              <p>{copyRows(page, "page.ai", "built")[0]?.body}</p>
              <dl>
                <div><dt>Business name</dt><dd>Riverside Dental</dd></div>
                <div><dt>Business hours</dt><dd>Mon – Fri, 8:00 am – 5:00 pm</dd></div>
                <div><dt>Address</dt><dd>123 Maple Ave, Riverton</dd></div>
                <div><dt>Services</dt><dd>General, Cosmetic, Emergency</dd></div>
              </dl>
            </article>
            <article className="tint-peach">
              <span className="feature-ico amber"><Icon name="users" size={16} /></span>
              <h3>{copyRows(page, "page.ai", "built")[1]?.title}</h3>
              <p>{copyRows(page, "page.ai", "built")[1]?.body}</p>
              <dl>
                <div><dt>Sales</dt><dd>Extension 514</dd></div>
                <div><dt>Support</dt><dd>Extension 515</dd></div>
              </dl>
            </article>
            <article className="tint-blue">
              <span className="feature-ico blue"><Icon name="mic" size={16} /></span>
              <h3>{copyRows(page, "page.ai", "built")[2]?.title}</h3>
              <p>{copyRows(page, "page.ai", "built")[2]?.body}</p>
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
            <h2>{say("chooseTitle")}</h2>
            <p>{say("chooseBody")}</p>
            <ul className="pub-list">
              {copyTexts(page, "page.ai", "choosePoints").map((point) => <li key={point}>{point}</li>)}
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
            <h2>{say("languageTitle")}</h2>
            <p>{say("languageBody")}</p>
            <p><Link href={say("languageHref")}>{say("languageLink")}</Link></p>
          </div>
        </div>
      </section>
      <section className="section ai-setup-sec">
        <div className="wrap">
          <h2 className="center">{say("stepsTitle")}</h2>
          <div className="ai-steps">
            {copyRows(page, "page.ai", "steps").map((item, index) => <div key={item.title}><b>{index + 1}</b><strong>{item.title}</strong><span>{item.body}</span></div>)}
          </div>
          <p className="pub-fine center">{say("stepsFine")}</p>
          <div className="ai-finder">
            <form action="/account/register" method="get">
              <h2>{say("finderTitle")}</h2>
              <input type="hidden" name="product" value="ai" />
              <div>
                <label>{say("finderTeam")}
                  <select name="people" defaultValue="5">
                    <option value="1">1 person</option>
                    <option value="5">Up to 5 people</option>
                    <option value="10">Up to 10 people</option>
                  </select>
                </label>
                <label>{say("finderLanguage")}
                  <select name="language" defaultValue="">
                    <option value="">Select a language</option>
                    <option value="1">Any language</option>
                  </select>
                </label>
              </div>
              <button className="btn btn-primary" type="submit">{say("finderButton")}</button>
            </form>
            <aside>
              <span className="feature-ico blue"><Icon name="message" size={16} /></span>
              <h3>{say("reviewTitle")}</h3>
              <p>{say("reviewBody")}</p>
              <Link href={say("reviewHref")}>{say("reviewLink")}</Link>
            </aside>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap ai-faq">
          <h2>{say("faqTitle")}</h2>
          <FaqBlock faqs={copyFaqs(page, "page.ai")} cards />
        </div>
      </section>
      <section className="ai-end">
        <div className="wrap">
          <h2>{say("endTitle")}</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href={say("endHref")}>{say("endCta")}</Link>
            <Link className="btn btn-ghost" href={say("endSecondaryHref")}>{say("endSecondary")}</Link>
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
  const say = (key: string) => t(page, "page.pricing", key);
  const phrases = Object.fromEntries(["inherit", "queues", "reporting", "desk", "deskSupport", "hours", "rings", "ai", "softphone", "voicemail", "peopleOne", "peopleMany", "minutes", "minutesPeriod", "month"].map((key) => [key, say(key)]));
  const blurbs = copyRows(page, "page.pricing", "blurbs").map((item) => ({ name: item.name, text: item.text }));
  void faqs;
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap center">
          <p className="pub-kicker">{str(page, "eyebrow", say("kicker") || "Plans & pricing")}</p>
          <h1>{str(page, "title", "Choose the right fit")} {str(page, "titleEm", "for your business calls.")}</h1>
          <p>{str(page, "lead", "Compare team capacity, outbound minutes and the features your business needs.")}</p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <PublicPlans plans={plans} verb={say("verb") || "Explore"} period ribbon={say("ribbon")} blurbs={blurbs} phrases={phrases} />
          <p className="pub-fine">{say("note")}</p>
          <div className="pub-note"><span><b>{say("customTitle")}</b> {say("customBody")}</span><Link className="btn btn-coral" href={say("customHref")}>{say("customCta")}</Link></div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>{say("compareTitle")}</h2>
          <table className="pub-table">
            <thead><tr><th>{say("compareFeature")}</th>{ordered.map((plan) => <th key={plan.name}>{plan.name}</th>)}</tr></thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label}>
                  <td>{({ People: say("comparePeople"), "Outbound minutes per plan period": say("compareMinutes"), "Softphone access": say("compareSoftphone"), "Voicemail & forwarding": say("compareVoicemail"), "Desk phone support": say("compareDesk"), "Business hours & ring groups": say("compareHours"), "AI receptionist": say("compareAi"), "Call queues": say("compareQueues"), "Call reporting": say("compareReporting") } as Record<string, string>)[row.label] || row.label}</td>
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
          <h2>{say("costTitle")}</h2>
          <div className="pub-grid-4">
            {copyRows(page, "page.pricing", "costs").map((item, index) => {
              const icon = ["phone", "shield", "bot", "card"][index] || "phone";
              return [icon, item.title, item.body];
            }).map(([icon, title, body]) => (
              <article key={title} className="pub-card"><span className="cost-ico"><Icon name={icon} size={16} /></span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>
      {bundles.length > 0 ? (
        <section className="section">
          <div className="wrap">
            <h2>{say("bundlesTitle")}</h2>
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
            <p className="pub-fine">{say("bundlesFine")} <Link href={say("bundlesHref")}>{say("bundlesLink")}</Link></p>
          </div>
        </section>
      ) : null}
      <section className="section">
        <div className="wrap">
          <div className="finder-row">
            <div><h2>{say("finderTitle")}</h2><p>{say("finderBody")}</p></div>
            <form className="finder" action="/account/register" method="get">
              <label>{say("finderTeam")}
                <select name="people" defaultValue="5">
                  <option value="1">1 person</option>
                  <option value="5">Up to 5 people</option>
                  <option value="10">Up to 10 people</option>
                </select>
              </label>
              <label className="check-option"><input type="checkbox" name="ai" value="1" /> {say("finderAi")}</label>
              <span>
                <button className="btn btn-primary" type="submit">{say("finderButton")}</button>
                <p className="pub-fine">{say("finderFine")}</p>
              </span>
            </form>
          </div>
        </div>
      </section>
      <section className="section"><div className="wrap"><h2>{say("faqTitle")}</h2><FaqBlock faqs={copyFaqs(page, "page.pricing")} startClosed /></div></section>
      <section className="price-end">
        <div className="wrap">
          <h2>{say("endTitle")}</h2>
          <div className="pub-actions">
            <Link className="btn btn-coral" href={say("endHref")}>{say("endCta")}</Link>
            <Link className="btn btn-navy" href={say("endSecondaryHref")}>{say("endSecondary")}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicHow({ home, page = home, plans, showDemo, prompt = "" }: { home: Record<string, unknown>; page?: Record<string, unknown>; plans: Plan[]; showDemo: boolean; prompt?: string }) {
  const sample = prompt.trim() || str(home, "chatSampleUser");
  const say = (key: string) => t(page, "page.how", key);
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
            <p className="pub-kicker">{say("kicker")}</p>
            <h1>{say("title")}</h1>
            <p>{say("lead")}</p>
            <div className="pub-actions">
              <Link className="btn btn-primary" href={say("primaryHref")}>{say("primaryCta")}</Link>
              <Link className="btn btn-secondary" href={say("secondaryHref")}>{say("secondaryCta")}</Link>
            </div>
          </div>
          <img className="how-mark" src="/marketing/setup-check.png" alt="" />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <h2>{say("stepsTitle")}</h2>
          <div className="pub-steps">
            {copyRows(page, "page.how", "steps").map((item, index) => <div key={item.title}><b>{index + 1}</b><strong>{item.title}</strong><p>{item.body}</p></div>)}
          </div>
        </div>
      </section>
      <section className="section alt" id="assistant">
        <div className="wrap how-assist">
          <div>
            <p className="pub-kicker">{say("assistKicker")}</p>
            <h2>{say("assistTitle")}</h2>
            <p>{say("assistBody")}</p>
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
          {copyRows(page, "page.how", "cards").map((item, index) => (
            <article key={item.title} className="pub-card"><span className="cost-ico"><Icon name={["checkcircle", "calendar", "users"][index] || "checkcircle"} size={16} /></span><h3>{item.title}</h3><p>{item.body}</p></article>
          ))}
        </div>
      </section>
      <section className="home-end">
        <div className="wrap">
          <h2>{say("endTitle")}</h2>
          <div className="pub-actions">
            <Link className="btn btn-light" href={say("endHref")}>{say("endCta")}</Link>
            <Link className="btn btn-ghost" href={say("endSecondaryHref")}>{say("endSecondary")}</Link>
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
  backLabel = "Back to website →",
  helpLabel = "Need help?",
  stepAccount = "Account",
  stepPlan = "Plan & payment",
}: {
  title: React.ReactNode;
  lead: string;
  kicker: string;
  children: React.ReactNode;
  points?: string[];
  step?: "account" | "code";
  scene?: "desk" | "calls";
  art?: string;
  backLabel?: string;
  helpLabel?: string;
  stepAccount?: string;
  stepPlan?: string;
}) {
  return (
    <main>
      <div className="pub-authbar">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span className="mark-wave" /><span className="mark-wave" /><span className="mark-wave" /></span>SautiCall</Link>
        <nav>
          <Link href="/">{backLabel}</Link>
          <Link href="/contact">{helpLabel}</Link>
        </nav>
      </div>
      <div className="pub-auth-grid">
        <section className="pub-auth-side">
          <h1>{title}</h1>
          <p>{lead}</p>
          <div className="auth-art">{art ? <img src={art} alt="" decoding="async" /> : scene === "calls" ? <CallsMock /> : <DeskMock />}</div>
          {points ? <div className="pub-checks">{points.map((point) => {
            const icon = /account/i.test(point) ? "users" : /guided|setup/i.test(point) ? "settings" : "checkcircle";
            return <div key={point}><span><Icon name={icon} size={18} /></span>{point}</div>;
          })}</div> : null}
          <p className="pub-legal"><span>© 2026 SautiCall</span><Link href="/contact">Help</Link></p>
        </section>
        <section className="pub-auth-main">
          <p className="pub-kicker">{kicker}</p>
          {step === "account" ? (
            <div className="pub-steps-line"><span className="n on">1</span><span className="on">{stepAccount}</span><span>—</span><span className="n">2</span><span>{stepPlan}</span></div>
          ) : null}
          {children}
        </section>
      </div>
    </main>
  );
}
