"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "../Icon";

type Item = { title: string; body: string; href: string; topic: string };

const TOPICS = [
  ["all", "All questions", "menu"],
  ["started", "Getting started", "target"],
  ["numbers", "Numbers & transfers", "phone"],
  ["phone", "Phone system & devices", "monitor"],
  ["ai", "AI receptionist", "spark"],
  ["billing", "Plans & minutes", "card"],
  ["voicemail", "Voicemail", "mail"],
  ["account", "Account & security", "lock"],
] as const;

function topicOf(title: string) {
  const text = title.toLowerCase();
  if (/number|port|transfer/.test(text)) return "numbers";
  if (/minute|plan|price|pay|invoice|subscription|upgrade/.test(text)) return "billing";
  if (/voicemail/.test(text)) return "voicemail";
  if (/ai|language|receptionist/.test(text)) return "ai";
  if (/password|security|authentication|account|mfa|two-factor/.test(text)) return "account";
  if (/desk|phone|extension|device|queue|team/.test(text)) return "phone";
  if (/start|setup|get started/.test(text)) return "started";
  return "started";
}

export function HelpCenter({ faqs, posts }: { faqs: { q: string; a: string }[]; posts: { slug: string; title: string; excerpt: string }[] }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const guide: Item[] = [
    { title: "How do I get started with SautiCall?", body: "Compare plans or use the setup assistant to find a configuration. Create your account, connect a number, add your team, and place a test call once service is active.", href: "/how-it-works", topic: "started" },
    { title: "Can I keep my existing business number?", body: "Yes. Start a number transfer from your account and follow each step. The team steps in when a transfer needs a person.", href: "/account/porting", topic: "numbers" },
    { title: "Can I use desk phones and mobile apps?", body: "Yes. A compatible desk phone can be connected, and the phone app works on a computer or mobile phone.", href: "/solutions#phones", topic: "phone" },
    { title: "Which plans include the AI receptionist?", body: "The receptionist is included on the plans that list it. On the published plans, that is Small Business and Team.", href: "/pricing", topic: "ai" },
    { title: "Where can I check my remaining minutes?", body: "Sign in and open Calls & voicemail. The page shows the minutes included with your plan and how many are left.", href: "/account/minutes", topic: "billing" },
    { title: "Can I buy extra call minutes?", body: "Yes. From Calls & voicemail you can buy a minute bundle. Bought minutes last until they are used.", href: "/account/minutes", topic: "billing" },
    { title: "How do I set up my voicemail greeting?", body: "Each extension has a mailbox. Greetings and messages stay in the phone app.", href: "/account/minutes", topic: "voicemail" },
    { title: "How do I enable two-factor authentication?", body: "Open Settings, then Security, and scan the code with an authenticator app.", href: "/account/security", topic: "account" },
    { title: "How do I get help with my account?", body: "Sign in and open a support ticket, or contact us for a general question.", href: "/account/tickets", topic: "account" },
  ];
  const items = useMemo<Item[]>(() => {
    const seen = new Set(guide.map((item) => item.title.toLowerCase()));
    return [
      ...guide,
      ...faqs.filter((faq) => !seen.has(faq.q.toLowerCase())).map((faq) => ({ title: faq.q, body: faq.a, href: "", topic: topicOf(faq.q) })),
      ...posts.map((post) => ({ title: post.title, body: post.excerpt, href: `/faq/${post.slug}`, topic: topicOf(post.title) })),
    ];
  }, [faqs, posts]);
  const needle = query.trim().toLowerCase();
  const shown = items.filter((item) => (topic === "all" || item.topic === topic) && (!needle || `${item.title} ${item.body}`.toLowerCase().includes(needle)));
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
          <p className="pub-kicker">Help & FAQ</p>
          <h1>Find the answer. Get back to business.</h1>
          <p>Explore common questions about numbers, calling, plans and your account.</p>
          <label className="pub-search">
            <Icon name="search" size={16} />
            <input aria-label="Search questions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions, topics or keywords..." />
          </label>
          <div className="pub-chips">
            <span>Popular topics:</span>
            {[["numbers", "Number transfers"], ["billing", "Call minutes"], ["ai", "AI receptionist"]].map(([id, label]) => (
              <button key={id} className={topic === id ? "active" : ""} type="button" onClick={() => setTopic(topic === id ? "all" : id)}>{label}</button>
            ))}
          </div>
          </div>
          <img className="help-bubbles" src="/marketing/help-bubbles.png" alt="" />
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-help">
          <aside>
            <h2>Browse topics</h2>
            <div className="pub-topics">
              {TOPICS.map(([id, label, icon]) => (
                <button key={id} className={topic === id ? "active" : ""} type="button" onClick={() => setTopic(id)}><Icon name={icon} size={16} /> {label}</button>
              ))}
            </div>
            <article className="pub-card help-side" style={{ marginTop: 16 }}>
              <span className="cost-ico"><Icon name="headset" size={16} /></span>
              <h3>Need account-specific help?</h3>
              <p>Sign in to create or follow a support ticket.</p>
              <Link className="btn btn-secondary" href="/account/login">Sign in for support</Link>
            </article>
          </aside>
          <div>
            <h2>Common questions</h2>
            <p>{shown.length === 0 ? "No questions match that search." : "Browse by topic or search above."}</p>
            {shown.map((item, index) => (
              <details key={item.title} className={`pub-q${index === 0 ? " open" : ""}`} open={index === 0}>
                <summary>{item.title}</summary>
                <p>{item.body}</p>
                {item.href ? <p><Link href={item.href}>{item.topic === "started" ? "See how it works →" : item.topic === "billing" ? "Compare plans →" : "Read more →"}</Link></p> : null}
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-grid-3">
          <article className="pub-card help-jump"><span className="cost-ico"><Icon name="book" size={16} /></span><h3>New to SautiCall?</h3><p>Learn the basics and get set up in a few simple steps.</p><Link href="/how-it-works">Read the setup guide →</Link></article>
          <article className="pub-card help-jump"><span className="cost-ico coral"><Icon name="chart" size={16} /></span><h3>Choosing a plan?</h3><p>Compare features and find the right plan for your business.</p><Link href="/pricing">Compare plans →</Link></article>
          <article className="pub-card help-jump"><span className="cost-ico"><Icon name="phone" size={16} /></span><h3>Need to talk?</h3><p>Have a question we didn&apos;t cover? We&apos;re here to help.</p><Link href="/contact">Contact us →</Link></article>
        </div>
      </section>
      <section className="help-ask">
        <div className="wrap">
          <div><img className="ask-art" src="/marketing/help-bubbles.png" alt="" /><div><h2>Still have a question?</h2><p>Contact us for general questions, or sign in for help with your account.</p></div></div>
          <div className="pub-actions">
            <Link className="btn btn-primary" href="/contact">Contact us</Link>
            <Link className="btn btn-secondary" href="/account/login">Sign in for support</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
