"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Item = { title: string; body: string; href: string; topic: string };

const TOPICS = [
  ["all", "All questions"],
  ["started", "Getting started"],
  ["numbers", "Numbers & transfers"],
  ["phone", "Phone system & devices"],
  ["ai", "AI receptionist"],
  ["billing", "Plans & minutes"],
  ["voicemail", "Voicemail"],
  ["account", "Account & security"],
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
  const items = useMemo<Item[]>(() => [
    ...faqs.map((faq) => ({ title: faq.q, body: faq.a, href: "", topic: topicOf(faq.q) })),
    ...posts.map((post) => ({ title: post.title, body: post.excerpt, href: `/faq/${post.slug}`, topic: topicOf(post.title) })),
  ], [faqs, posts]);
  const needle = query.trim().toLowerCase();
  const shown = items.filter((item) => (topic === "all" || item.topic === topic) && (!needle || `${item.title} ${item.body}`.toLowerCase().includes(needle)));
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap">
          <p className="pub-kicker">Help & FAQ</p>
          <h1>Find the answer. Get back to business.</h1>
          <p>Explore common questions about numbers, calling, plans and your account.</p>
          <label className="pub-search">
            <input aria-label="Search questions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions, topics or keywords..." />
          </label>
          <div className="pub-chips">
            {[["numbers", "Number transfers"], ["billing", "Call minutes"], ["ai", "AI receptionist"]].map(([id, label]) => (
              <button key={id} className={topic === id ? "active" : ""} type="button" onClick={() => setTopic(topic === id ? "all" : id)}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-help">
          <aside>
            <h2>Browse topics</h2>
            <div className="pub-topics">
              {TOPICS.map(([id, label]) => (
                <button key={id} className={topic === id ? "active" : ""} type="button" onClick={() => setTopic(id)}>{label}</button>
              ))}
            </div>
            <article className="pub-card" style={{ marginTop: 16 }}>
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
                {item.href ? <p><Link href={item.href}>Read the article</Link></p> : null}
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-grid-3">
          <article className="pub-card"><h3>New to SautiCall?</h3><p>Learn the basics and get set up.</p><Link href="/how-it-works">Read the setup guide</Link></article>
          <article className="pub-card"><h3>Choosing a plan?</h3><p>Compare features and find the right plan.</p><Link href="/pricing">Compare plans</Link></article>
          <article className="pub-card"><h3>Need to talk?</h3><p>Have a question we did not cover? We are here to help.</p><Link href="/contact">Contact us</Link></article>
        </div>
      </section>
      <section className="pub-end">
        <div className="wrap">
          <div><h2>Still have a question?</h2><p>Contact us for general questions, or sign in for help with your account.</p></div>
          <div className="pub-actions">
            <Link className="btn btn-primary" href="/contact">Contact us</Link>
            <Link className="btn btn-secondary" href="/account/login">Sign in for support</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
