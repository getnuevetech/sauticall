import Link from "next/link";
import { Icon } from "../Icon";
import { ChatDemo, ContactForm, CustomRequestForm, Estimator } from "./Interactive";
import { EndCta, PhoneArt } from "./Chrome";
import type { Faq, Persona, Plan, Service } from "@/lib/types";

function str(page: Record<string, unknown>, key: string) {
  const value = page[key];
  return typeof value === "string" ? value : "";
}
function num(page: Record<string, unknown>, key: string) {
  const value = page[key];
  return typeof value === "number" ? value : Number(value || 0);
}
function list(page: Record<string, unknown>, key: string) {
  const value = page[key];
  return Array.isArray(value) ? value : [];
}

function PricingCards({ plans, ribbon, languageBadge }: { plans: Plan[]; ribbon: string; languageBadge: string }) {
  return (
    <div className="price-grid">
      {plans.map((plan) => (
        <article key={plan.name} className={`price-card ${plan.popular ? "popular" : ""} ${plan.custom ? "custom" : ""}`}>
          {plan.popular ? <div className="price-ribbon">{ribbon}</div> : null}
          <div className="plan-name">{plan.name}</div>
          <p>{plan.desc}</p>
          <div className="price-line">
            {plan.custom ? <strong>{plan.priceLabel || "Custom"}</strong> : (<><sup>$</sup><strong>{plan.price}</strong><span>/month*</span></>)}
          </div>
          {plan.multilingual && languageBadge ? <div className="lang-pill">{languageBadge}</div> : null}
          <div className="unit-line"><Icon name="users" size={16} /> {plan.units}</div>
          <div className="plan-rule" />
          <ul>
            {plan.features.map((feature) => <li key={feature}><Icon name="check" size={17} /> <span>{feature}</span></li>)}
          </ul>
          <Link className={`btn ${plan.popular ? "btn-primary" : "btn-secondary"}`} href={plan.ctaHref}>{plan.ctaLabel} <Icon name="arrow" size={16} /></Link>
          <small>{plan.note}</small>
        </article>
      ))}
    </div>
  );
}

function LanguageBand({ page }: { page: Record<string, unknown> }) {
  if (!str(page, "languageTitle")) return null;
  return (
    <section className="section detail-band">
      <div className="wrap">
        <div className="section-heading">
          <span className="eyebrow">{str(page, "languageEyebrow")}</span>
          <h2>{str(page, "languageTitle")}</h2>
          <p>{str(page, "languageBody")}</p>
          <p>{str(page, "languageException")}</p>
        </div>
      </div>
    </section>
  );
}

function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="faq-list">
      {faqs.map((faq, index) => (
        <details key={faq.q} open={index === 0}>
          <summary>{faq.q}<span><Icon name="arrowdown" size={19} /></span></summary>
          <p>{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

function chatCopy(page: Record<string, unknown>) {
  return {
    title: str(page, "chatTitle"),
    sub: str(page, "chatSub"),
    status: str(page, "chatStatus"),
    hello: str(page, "chatHello"),
    sampleUser: str(page, "chatSampleUser"),
    proposal: str(page, "chatProposal"),
    points: list(page, "chatPoints").filter((item): item is string => typeof item === "string"),
    foot: str(page, "chatFoot"),
    placeholder: str(page, "chatPlaceholder"),
    resultTitle: str(page, "chatResultTitle"),
    resultNote: str(page, "chatResultNote"),
  };
}

export function HomePage({
  page,
  services,
  plans,
  personas,
  showDemo,
}: {
  page: Record<string, unknown>;
  services: Service[];
  plans: Plan[];
  personas: Persona[];
  showDemo: boolean;
}) {
  const checks = list(page, "checks").filter((item): item is string => typeof item === "string");
  const faces = list(page, "faces").filter((item): item is string => typeof item === "string");
  return (
    <main>
      <section className="hero hero-b">
        <div className="wrap b-hero-grid">
          <div className="b-hero-copy">
            <div className="tiny-head"><span className="starlet">✳</span> {str(page, "eyebrow")}</div>
            <h1>{str(page, "titleLead")} <span className="underline-coral">{str(page, "titleAccent")}</span></h1>
            <p>{str(page, "lead")}</p>
            <div className="cta-pair">
              <Link className="btn btn-primary" href={str(page, "primaryHref")}>{str(page, "primaryCta")} <Icon name="arrow" size={18} /></Link>
              <Link className="btn btn-secondary" href={str(page, "secondaryHref")}>{str(page, "secondaryCta")} <Icon name="arrow" size={17} /></Link>
            </div>
            <div className="b-little-line">
              <span className="face-stack">{faces.map((face) => <i key={face}>{face}</i>)}</span>
              <span>{str(page, "faceCaption")}</span>
            </div>
          </div>
          <div className="b-visual">
            <PhoneArt
              brand={str(page, "phoneBrand")}
              title={str(page, "phoneTitle")}
              sub={str(page, "phoneSub")}
              badge1={str(page, "phoneBadge1")}
              badge2={str(page, "phoneBadge2")}
              chip1={str(page, "chipAnswered")}
              chip2={str(page, "chipRoute")}
              chip3={str(page, "chipAppointment")}
            />
            <div className="b-visual-label">{str(page, "visualLabel")} <span>↗</span></div>
          </div>
        </div>
        <div className="wrap b-lower-hero">
          {checks.map((check) => <div key={check}>{check} <b>✓</b></div>)}
        </div>
      </section>
      <section className="section b-situation">
        <div className="wrap">
          <div className="split-b-intro">
            <div>
              <div className="section-heading">
                <span className="eyebrow">{str(page, "situationEyebrow")}</span>
                <h2>{str(page, "situationTitle")}</h2>
              </div>
            </div>
            <p>{str(page, "situationBody")}</p>
          </div>
          <div className="b-service-grid">
            {services.slice(0, 3).map((service, index) => (
              <Link key={service.title} className="b-service" href={service.href} style={{ background: service.cardColor }}>
                <span className="service-num">0{index + 1}</span>
                <div className={`b-illustration ill-${index}`}><Icon name={service.icon} size={52} /></div>
                <h3>{service.title}</h3>
                <p>{service.desc}</p>
                <span className="round-arrow"><Icon name="arrow" size={21} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section b-easy">
        <div className="wrap b-easy-grid">
          <div className="b-easy-copy">
            <div className="section-heading">
              <span className="eyebrow">{str(page, "easyEyebrow")}</span>
              <h2>{str(page, "easyTitle")} <i>{str(page, "easyTitleEm")}</i></h2>
              <p>{str(page, "easyBody")}</p>
            </div>
            <Link className="btn btn-primary" href={str(page, "easyHref")}>{str(page, "easyCta")} <Icon name="arrow" size={18} /></Link>
          </div>
          {showDemo ? <ChatDemo copy={chatCopy(page)} /> : null}
        </div>
      </section>
      <section className="section b-personas">
        <div className="wrap">
          <div className="section-heading">
            <span className="eyebrow">{str(page, "personaEyebrow")}</span>
            <h2>{str(page, "personaTitle")}</h2>
          </div>
          <div className="persona-grid">
            {personas.map((persona) => (
              <article key={persona.index}>
                <span>{persona.index}</span>
                <h3>{persona.title}</h3>
                <p>{persona.body}</p>
                <Link href={persona.href}>{persona.cta} <Icon name="arrow" size={16} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <LanguageBand page={page} />
      <section className="section b-price">
        <div className="wrap">
          <div className="section-heading">
            <span className="eyebrow">{str(page, "priceEyebrow")}</span>
            <h2>{str(page, "priceTitle")}</h2>
            <p>{str(page, "priceBody")}</p>
          </div>
          <PricingCards plans={plans} ribbon={str(page, "ribbon")} languageBadge={str(page, "languageBadge")} />
          <p className="disclaimer">{str(page, "disclaimer")}</p>
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}

function InnerHero({ eyebrow, title, titleEm, lead }: { eyebrow: string; title: string; titleEm: string; lead: string }) {
  return (
    <section className="inner-hero">
      <div className="wrap">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title} {titleEm ? <em>{titleEm}</em> : null}</h1>
        <p>{lead}</p>
        <div className="inner-hero-graphic"><div className="floating-squiggle" /><span className="inner-symbol"><Icon name="spark" size={44} /></span></div>
      </div>
    </section>
  );
}

export function SolutionsPage({ page, services }: { page: Record<string, unknown>; services: Service[] }) {
  const points = list(page, "phonesPoints").filter((item): item is string => typeof item === "string");
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap">
          <div className="section-heading">
            <span className="eyebrow">{str(page, "sectionEyebrow")}</span>
            <h2>{str(page, "sectionTitle")}</h2>
            <p>{str(page, "sectionBody")}</p>
          </div>
          <div className="features-grid">
            {services.map((service) => (
              <article key={service.title} className="feature-card">
                <div className="feature-icon"><Icon name={service.icon} size={24} /></div>
                <span className="feature-tag">{service.tag}</span>
                <h3>{service.title}</h3>
                <p>{service.desc}</p>
                <Link className="text-link" href={service.href}>{str(page, "exploreLabel")} <Icon name="arrow" size={15} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section detail-band" id="phones">
        <div className="wrap details-grid">
          <div>
            <span className="eyebrow">{str(page, "phonesEyebrow")}</span>
            <h2>{str(page, "phonesTitle")} <em>{str(page, "phonesTitleEm")}</em></h2>
            <p>{str(page, "phonesBody")}</p>
            <ul className="check-list">{points.map((point) => <li key={point}><Icon name="checkcircle" /> {point}</li>)}</ul>
          </div>
          <div className="device-display">
            <div className="device-monitor">
              <span className="dev-header">{str(page, "deviceHeader")}</span>
              <div className="dev-ring"><Icon name="phone" size={34} /></div>
              <strong>{str(page, "deviceReady")}</strong>
              <div className="dev-actions"><span><Icon name="mic" size={16} /></span><span><Icon name="users" size={16} /></span><span><Icon name="phone" size={16} /></span></div>
            </div>
            <div className="device-mobile"><Icon name="smartphone" size={39} /><span>{str(page, "deviceExt")}</span><small>{str(page, "deviceState")}</small></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="number-grid">
            <article id="numbers"><Icon name="globe" size={31} /><h3>{str(page, "numbersTitle")}</h3><p>{str(page, "numbersBody")}</p></article>
            <article id="porting"><Icon name="phone" size={31} /><h3>{str(page, "portingTitle")}</h3><p>{str(page, "portingBody")}</p></article>
          </div>
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}

function Cards({ items }: { items: { icon?: string; title?: string; body?: string }[] }) {
  return (
    <div className="three-grid">
      {items.map((card) => (
        <article key={card.title}>
          <Icon name={card.icon || "spark"} size={29} />
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  );
}

export function AiPage({ page, home }: { page: Record<string, unknown>; home: Record<string, unknown> }) {
  const points = list(page, "points").filter((item): item is string => typeof item === "string");
  const cards = list(page, "cards") as { icon?: string; title?: string; body?: string }[];
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap ai-feature-split">
          <div className="ai-story">
            <div className="section-heading">
              <span className="eyebrow">{str(page, "storyEyebrow")}</span>
              <h2>{str(page, "storyTitle")}</h2>
              <p>{str(page, "storyBody")}</p>
            </div>
            <ul className="check-list">{points.map((point) => <li key={point}><Icon name="checkcircle" /> {point}</li>)}</ul>
          </div>
          <PhoneArt brand={str(home, "phoneBrand")} title={str(home, "phoneTitle")} sub={str(home, "phoneSub")} badge1={str(home, "phoneBadge1")} badge2={str(home, "phoneBadge2")} chip1={str(home, "chipAnswered")} chip2={str(home, "chipRoute")} chip3={str(home, "chipAppointment")} />
        </div>
      </section>
      <LanguageBand page={page} />
      <section className="section setup-band">
        <div className="wrap">
          <div className="section-heading">
            <span className="eyebrow">{str(page, "controlEyebrow")}</span>
            <h2>{str(page, "controlTitle")}</h2>
            <p>{str(page, "controlBody")}</p>
          </div>
          <Cards items={cards} />
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}

export function HowPage({ page, home, showDemo }: { page: Record<string, unknown>; home: Record<string, unknown>; showDemo: boolean }) {
  const steps = list(page, "steps") as { n?: string; title?: string; body?: string }[];
  const cards = list(page, "cards") as { icon?: string; title?: string; body?: string }[];
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap how-split">
          <div>
            <div className="section-heading">
              <span className="eyebrow">{str(page, "sectionEyebrow")}</span>
              <h2>{str(page, "sectionTitle")}</h2>
              <p>{str(page, "sectionBody")}</p>
            </div>
            <div className="step-list">
              {steps.map((step) => (
                <div key={step.n}><b>{step.n}</b><span><strong>{step.title}</strong><small>{step.body}</small></span></div>
              ))}
            </div>
          </div>
          {showDemo ? <ChatDemo copy={chatCopy(home)} /> : null}
        </div>
      </section>
      <section className="section detail-band">
        <div className="wrap">
          <div className="section-heading">
            <span className="eyebrow">{str(page, "detailEyebrow")}</span>
            <h2>{str(page, "detailTitle")}</h2>
            <p>{str(page, "detailBody")}</p>
          </div>
          <Cards items={cards} />
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}

export function PricingPage({ page, plans, faqs, showEstimator }: { page: Record<string, unknown>; plans: Plan[]; faqs: Faq[]; showEstimator: boolean }) {
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap">
          <PricingCards plans={plans} ribbon={str(page, "ribbon")} languageBadge={str(page, "languageBadge")} />
          <p className="disclaimer">{str(page, "disclaimer")}</p>
          {showEstimator ? (
            <div className="calculator" id="estimate">
              <div>
                <span className="eyebrow">{str(page, "estimateEyebrow")}</span>
                <h2>{str(page, "estimateTitle")}</h2>
                <p>{str(page, "estimateBody")}</p>
              </div>
              <Estimator
                plans={plans.filter((plan) => !plan.custom)}
                aiPrice={num(page, "aiAddonPrice")}
                aiLabel={str(page, "estimateAiLabel")}
                planLabel={str(page, "estimatePlanLabel")}
                totalLabel={str(page, "estimateTotalLabel")}
                cta={str(page, "estimateCta")}
                href={str(page, "estimateHref")}
              />
            </div>
          ) : null}
        </div>
      </section>
      <section className="section setup-band">
        <div className="wrap">
          <div className="faq-split">
            <div>
              <div className="section-heading">
                <span className="eyebrow">{str(page, "faqEyebrow")}</span>
                <h2>{str(page, "faqTitle")}</h2>
                <p>{str(page, "faqBody")}</p>
              </div>
            </div>
            <FaqList faqs={faqs} />
          </div>
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}

export function AboutPage({ page }: { page: Record<string, unknown> }) {
  const values = list(page, "values") as { icon?: string; title?: string; body?: string }[];
  const cards = list(page, "cards") as { icon?: string; title?: string; body?: string }[];
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap about-grid">
          <div>
            <span className="eyebrow">{str(page, "visionEyebrow")}</span>
            <h2>{str(page, "visionTitle")} <em>{str(page, "visionTitleEm")}</em></h2>
            <p>{str(page, "visionBody1")}</p>
            <p>{str(page, "visionBody2")}</p>
          </div>
          <div className="about-values">
            {values.map((value) => (
              <article key={value.title}><Icon name={value.icon || "spark"} size={26} /><h3>{value.title}</h3><p>{value.body}</p></article>
            ))}
          </div>
        </div>
      </section>
      <section className="section detail-band">
        <div className="wrap">
          <div className="section-heading">
            <span className="eyebrow">{str(page, "hoodEyebrow")}</span>
            <h2>{str(page, "hoodTitle")}</h2>
            <p>{str(page, "hoodBody")}</p>
          </div>
          <Cards items={cards} />
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}

export function ContactPage({ page, faqs, formEnabled }: { page: Record<string, unknown>; faqs: Faq[]; formEnabled: boolean }) {
  const steps = list(page, "steps") as { icon?: string; label?: string }[];
  const services = list(page, "services").filter((item): item is string => typeof item === "string");
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap contact-grid">
          <div className="contact-left">
            <span className="eyebrow">{str(page, "sideEyebrow")}</span>
            <h2>{str(page, "sideTitle")}</h2>
            <p>{str(page, "sideBody")}</p>
            <div className="contact-steps">
              {steps.map((step) => <div key={step.label}><Icon name={step.icon || "message"} size={20} /> <span>{step.label}</span></div>)}
            </div>
            <div className="contact-note"><Icon name="shield" size={22} /> <span>{str(page, "note")}</span></div>
          </div>
          <ContactForm
            enabled={formEnabled}
            copy={{
              formTitle: str(page, "formTitle"),
              nameLabel: str(page, "nameLabel"),
              namePlaceholder: str(page, "namePlaceholder"),
              emailLabel: str(page, "emailLabel"),
              emailPlaceholder: str(page, "emailPlaceholder"),
              serviceLabel: str(page, "serviceLabel"),
              services,
              messageLabel: str(page, "messageLabel"),
              messagePlaceholder: str(page, "messagePlaceholder"),
              submitLabel: str(page, "submitLabel"),
              thanks: str(page, "thanks"),
              closed: str(page, "closed"),
            }}
          />
        </div>
      </section>
      <section className="section setup-band">
        <div className="wrap faq-split">
          <div>
            <div className="section-heading">
              <span className="eyebrow">{str(page, "faqEyebrow")}</span>
              <h2>{str(page, "faqTitle")}</h2>
            </div>
          </div>
          <FaqList faqs={faqs} />
        </div>
      </section>
    </main>
  );
}

export function CustomPlanPage({ page, formEnabled }: { page: Record<string, unknown>; formEnabled: boolean }) {
  const steps = list(page, "steps") as { icon?: string; label?: string }[];
  return (
    <main>
      <InnerHero eyebrow={str(page, "eyebrow")} title={str(page, "title")} titleEm={str(page, "titleEm")} lead={str(page, "lead")} />
      <section className="section">
        <div className="wrap contact-grid">
          <div className="contact-left">
            <span className="eyebrow">{str(page, "sideEyebrow")}</span>
            <h2>{str(page, "sideTitle")}</h2>
            <p>{str(page, "sideBody")}</p>
            <div className="contact-steps">
              {steps.map((step) => <div key={step.label}><Icon name={step.icon || "message"} size={20} /> <span>{step.label}</span></div>)}
            </div>
            <div className="contact-note"><Icon name="shield" size={22} /> <span>{str(page, "note")}</span></div>
          </div>
          <CustomRequestForm
            enabled={formEnabled}
            copy={{
              formTitle: str(page, "formTitle"),
              nameLabel: str(page, "nameLabel"),
              namePlaceholder: str(page, "namePlaceholder"),
              companyLabel: str(page, "companyLabel"),
              companyPlaceholder: str(page, "companyPlaceholder"),
              emailLabel: str(page, "emailLabel"),
              emailPlaceholder: str(page, "emailPlaceholder"),
              phoneLabel: str(page, "phoneLabel"),
              phonePlaceholder: str(page, "phonePlaceholder"),
              needsLabel: str(page, "needsLabel"),
              needsPlaceholder: str(page, "needsPlaceholder"),
              submitLabel: str(page, "submitLabel"),
              thanks: str(page, "thanks"),
              closed: str(page, "closed"),
            }}
          />
        </div>
      </section>
      <EndCta eyebrow={str(page, "endEyebrow")} title={str(page, "endTitle")} body={str(page, "endBody")} cta={str(page, "endCta")} href={str(page, "endHref")} />
    </main>
  );
}
