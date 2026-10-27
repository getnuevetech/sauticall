"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { SetupAdvice } from "@/lib/setup-assistant";

export function MenuButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const nav = document.querySelector(".mobile-nav");
    if (!nav) return;
    const onClick = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a")) {
        nav.classList.remove("open");
        setOpen(false);
      }
    };
    nav.addEventListener("click", onClick);
    return () => nav.removeEventListener("click", onClick);
  }, []);
  return (
    <button
      className="menu-toggle"
      type="button"
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

export function SolutionsMenu({
  label,
  href,
  active,
  items,
}: {
  label: string;
  href: string;
  active: boolean;
  items: { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="nav-drop" ref={root} data-open={open ? "" : undefined}>
      <button type="button" className={active ? "active" : undefined} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
        {label} <Icon name="arrowdown" size={14} />
      </button>
      <span className="nav-drop-menu" role="menu">
        <Link href={href} prefetch={false}>{label}</Link>
        {items.map((item) => <Link key={item.href + item.label} href={item.href} prefetch={false} role="menuitem">{item.label}</Link>)}
      </span>
    </span>
  );
}

export function SetupAssistant({
  title,
  sub,
  status,
  placeholder,
  hello,
  proposal,
  sample,
  initial,
}: {
  title: string;
  sub: string;
  status: string;
  placeholder: string;
  hello: string;
  proposal: string;
  sample: string;
  initial: SetupAdvice | null;
}) {
  const [advice, setAdvice] = useState<SetupAdvice | null>(initial);
  const [said, setSaid] = useState(sample);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const prompt = String(new FormData(form).get("prompt") || "").trim();
    setPending(true);
    setMessage("");
    setSaid(prompt);
    const response = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    const payload = (await response.json()) as SetupAdvice & { message?: string };
    setPending(false);
    form.reset();
    if (!response.ok || !payload.planName) {
      setAdvice(null);
      setMessage(payload.message || "The assistant could not match a plan.");
      return;
    }
    setAdvice(payload);
  }

  return (
    <div className="chat-demo" id="ai-demo">
      <div className="chat-head">
        <span className="chat-head-icon"><Icon name="spark" size={19} /></span>
        <div><b>{title || "Setup assistant"}</b><small>{sub || "Matches your description to a plan you can subscribe to"}</small></div>
        <span className="chat-status"><i /> {pending ? "Reading" : status || "Ready"}</span>
      </div>
      <div className="chat-convo">
        <div className="bubble bot-bubble">{hello || "Tell me how you would like your business calls to work."}</div>
        {said ? <div className="bubble user-bubble">{said}</div> : null}
        {advice ? (
          <div className="proposal" aria-live="polite">
            <span className="proposal-head"><Icon name="spark" size={16} /> {proposal || "RECOMMENDED SETUP"}</span>
            <div className="proposal-grid">
              {advice.points.map((point) => <span key={point}><Icon name="check" size={15} /> {point}</span>)}
            </div>
            <div className="proposal-foot">
              <p>{advice.summary}</p>
              <a className="btn btn-primary" href={advice.href}>{advice.custom ? "Request this custom system" : `Create an account on ${advice.planName}`}</a>
            </div>
          </div>
        ) : null}
        {message ? <p className="form-feedback">{message}</p> : null}
      </div>
      <form className="demo-form" onSubmit={onSubmit}>
        <input name="prompt" aria-label="Describe your phone setup" placeholder={placeholder || "6 people, an AI receptionist, and keep our current number"} required />
        <button type="submit" aria-label="Recommend a setup" disabled={pending}><Icon name="arrow" size={18} /></button>
      </form>
    </div>
  );
}

export function Estimator({
  plans,
  planLabel,
  totalLabel,
}: {
  plans: { name: string; price: number; custom?: boolean; includedMinutes?: number }[];
  planLabel: string;
  totalLabel: string;
}) {
  const priced = plans.filter((item) => !item.custom && item.price > 0);
  const [name, setName] = useState(priced[1]?.name || priced[0]?.name || "");
  const plan = priced.find((item) => item.name === name) || priced[0];
  if (!plan) return null;
  return (
    <form id="estimate-form" action="/account/register" method="get">
      <label htmlFor="base-plan">{planLabel || "Plan"}
        <select id="base-plan" name="plan" value={plan.name} onChange={(event) => setName(event.target.value)}>
          {priced.map((item) => (
            <option key={item.name} value={item.name}>{item.name} · ${item.price}/month</option>
          ))}
        </select>
      </label>
      <div className="estimate-output"><span>{totalLabel || "Monthly price"}</span><strong>${plan.price}</strong></div>
      <button className="btn btn-primary" type="submit">Create an account on {plan.name}</button>
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
  setup = "",
}: {
  enabled: boolean;
  setup?: string;
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
      <label>{copy.needsLabel} <textarea required name="needs" rows={6} placeholder={copy.needsPlaceholder} defaultValue={setup} /></label>
      <button type="submit" className="btn btn-primary">{copy.submitLabel} <Icon name="arrow" size={17} /></button>
      <div className="form-feedback" role="status" aria-live="polite">{feedback}</div>
    </form>
  );
}
