"use client";

import { FormEvent, useState } from "react";
import { Icon } from "../Icon";

export function MenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <button
      className="menu-toggle"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      onClick={() => {
        const nav = document.querySelector(".mobile-nav");
        nav?.classList.toggle("open");
        setOpen(nav?.classList.contains("open") ?? false);
      }}
    >
      <Icon name={open ? "close" : "menu"} size={23} />
    </button>
  );
}

type ChatCopy = {
  title: string;
  sub: string;
  status: string;
  hello: string;
  sampleUser: string;
  proposal: string;
  points: string[];
  foot: string;
  placeholder: string;
  resultTitle: string;
  resultNote: string;
};

export function ChatDemo({ copy }: { copy: ChatCopy }) {
  const [result, setResult] = useState("");
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const val = String(new FormData(event.currentTarget).get("prompt") || "").toLowerCase();
    const match = val.match(/\b(\d+)\s*(?:employees|people|users|staff|extensions|team members)/i);
    const n = match?.[1] || "a few";
    const yes = /(ai|receptionist|assistant|automatically answer|answer calls)/.test(val);
    const port = /(keep|port|existing|transfer my number)/.test(val);
    setResult(`${n} team users · ${yes ? "AI receptionist requested" : "Standard business answering"} · ${port ? "Existing-number transfer" : "New business number (if needed)"}`);
  }
  return (
    <div className="chat-demo" id="ai-demo">
      <div className="chat-head">
        <span className="chat-head-icon"><Icon name="spark" size={19} /></span>
        <div><b>{copy.title}</b><small>{copy.sub}</small></div>
        <span className="chat-status"><i /> {copy.status}</span>
      </div>
      <div className="chat-convo">
        <div className="bubble bot-bubble">{copy.hello}</div>
        <div className="bubble user-bubble">{copy.sampleUser}</div>
        <div className="proposal">
          <span className="proposal-head"><Icon name="spark" size={16} /> {copy.proposal}</span>
          <div className="proposal-grid">
            {copy.points.map((point) => <span key={point}><Icon name="check" size={15} /> {point}</span>)}
          </div>
          <div className="proposal-foot">{copy.foot}</div>
        </div>
      </div>
      <form className="demo-form" onSubmit={onSubmit}>
        <input name="prompt" aria-label="Describe your phone setup" placeholder={copy.placeholder} required />
        <button type="submit" aria-label="Generate example setup"><Icon name="arrow" size={18} /></button>
      </form>
      {result ? (
        <div className="demo-result" aria-live="polite">
          <div className="sample-output">
            <strong><Icon name="spark" size={17} /> {copy.resultTitle}</strong>
            <p>{result}</p>
            <small>{copy.resultNote}</small>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Estimator({
  plans,
  aiPrice,
  aiLabel,
  planLabel,
  totalLabel,
  cta,
  href,
}: {
  plans: { name: string; price: number; custom?: boolean }[];
  aiPrice: number;
  aiLabel: string;
  planLabel: string;
  totalLabel: string;
  cta: string;
  href: string;
}) {
  const priced = plans.filter((item) => !item.custom);
  const [plan, setPlan] = useState(String(priced[1]?.price ?? priced[0]?.price ?? 0));
  const [ai, setAi] = useState(false);
  const total = Number(plan) + (ai ? aiPrice : 0);
  return (
    <form id="estimate-form">
      <label htmlFor="base-plan">{planLabel}</label>
      <select id="base-plan" value={plan} onChange={(event) => setPlan(event.target.value)}>
        {priced.map((item) => (
          <option key={item.name} value={item.price}>{item.name} · ${item.price}</option>
        ))}
      </select>
      <label className="check-option">
        <input type="checkbox" checked={ai} onChange={(event) => setAi(event.target.checked)} /> {aiLabel}
      </label>
      <div className="estimate-output"><span>{totalLabel}</span><strong>${total}</strong></div>
      <a className="btn btn-primary" href={href}>{cta} <Icon name="arrow" size={16} /></a>
    </form>
  );
}

export function ContactForm({
  copy,
  enabled,
}: {
  enabled: boolean;
  copy: {
    formTitle: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    serviceLabel: string;
    services: string[];
    messageLabel: string;
    messagePlaceholder: string;
    submitLabel: string;
    thanks: string;
    closed: string;
  };
}) {
  const [feedback, setFeedback] = useState("");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const payload = (await response.json()) as { message?: string };
    setFeedback(payload.message || copy.thanks.replace("{name}", String(data.name || "")));
    if (response.ok) form.reset();
  }
  if (!enabled) return <div className="contact-form"><p>{copy.closed}</p></div>;
  return (
    <form className="contact-form" onSubmit={onSubmit}>
      <h3>{copy.formTitle}</h3>
      <div className="form-grid">
        <label>{copy.nameLabel} <input required name="name" placeholder={copy.namePlaceholder} /></label>
        <label>{copy.emailLabel} <input required name="email" type="email" placeholder={copy.emailPlaceholder} /></label>
      </div>
      <label>{copy.serviceLabel}
        <select name="service">{copy.services.map((service) => <option key={service}>{service}</option>)}</select>
      </label>
      <label>{copy.messageLabel} <textarea required name="message" rows={5} placeholder={copy.messagePlaceholder} /></label>
      <button type="submit" className="btn btn-primary">{copy.submitLabel} <Icon name="arrow" size={17} /></button>
      <div className="form-feedback" role="status" aria-live="polite">{feedback}</div>
    </form>
  );
}

export function CustomRequestForm({
  copy,
  enabled,
}: {
  enabled: boolean;
  copy: {
    formTitle: string;
    nameLabel: string;
    namePlaceholder: string;
    companyLabel: string;
    companyPlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    needsLabel: string;
    needsPlaceholder: string;
    submitLabel: string;
    thanks: string;
    closed: string;
  };
}) {
  const [feedback, setFeedback] = useState("");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/custom-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const payload = (await response.json()) as { message?: string };
    setFeedback(payload.message || copy.thanks.replace("{name}", String(data.name || "")));
    if (response.ok) form.reset();
  }
  if (!enabled) return <div className="contact-form"><p>{copy.closed}</p></div>;
  return (
    <form className="contact-form" onSubmit={onSubmit}>
      <h3>{copy.formTitle}</h3>
      <div className="form-grid">
        <label>{copy.nameLabel} <input required name="name" placeholder={copy.namePlaceholder} /></label>
        <label>{copy.companyLabel} <input required name="company" placeholder={copy.companyPlaceholder} /></label>
      </div>
      <div className="form-grid">
        <label>{copy.emailLabel} <input required name="email" type="email" placeholder={copy.emailPlaceholder} /></label>
        <label>{copy.phoneLabel} <input required name="phone" type="tel" placeholder={copy.phonePlaceholder} /></label>
      </div>
      <label>{copy.needsLabel} <textarea required name="needs" rows={6} placeholder={copy.needsPlaceholder} /></label>
      <button type="submit" className="btn btn-primary">{copy.submitLabel} <Icon name="arrow" size={17} /></button>
      <div className="form-feedback" role="status" aria-live="polite">{feedback}</div>
    </form>
  );
}
