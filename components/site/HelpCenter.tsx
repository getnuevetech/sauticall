"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { copyLine, copyRows } from "@/lib/public-copy";
import { Icon } from "../Icon";

type Item = { title: string; body: string; href: string; topic: string; link?: string };

const TOPIC_ICONS = ["menu", "target", "phone", "monitor", "spark", "card", "mail", "lock"];

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

export function HelpCenter({ faqs, posts, page }: { faqs: { q: string; a: string }[]; posts: { slug: string; title: string; excerpt: string }[]; page: Record<string, unknown> }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const say = (key: string) => copyLine(page, "page.help", key);
  const topics = copyRows(page, "page.help", "topics");
  const guide: Item[] = copyRows(page, "page.help", "guide").map((item) => ({ title: item.title, body: item.body, href: item.href, topic: item.topic || "started", link: item.link }));
  const items = useMemo<Item[]>(() => {
    const seen = new Set(guide.map((item) => item.title.toLowerCase()));
    return [
      ...guide,
      ...faqs.filter((faq) => !seen.has(faq.q.toLowerCase())).map((faq) => ({ title: faq.q, body: faq.a, href: "", topic: topicOf(faq.q), link: "Read more →" })),
      ...posts.map((post) => ({ title: post.title, body: post.excerpt, href: `/faq/${post.slug}`, topic: topicOf(post.title) })),
    ];
  }, [faqs, posts, guide]);
  const needle = query.trim().toLowerCase();
  const shown = items.filter((item) => (topic === "all" || item.topic === topic) && (!needle || `${item.title} ${item.body}`.toLowerCase().includes(needle)));
  return (
    <main>
      <section className="pub-hero">
        <div className="wrap pub-hero-grid">
          <div>
          <p className="pub-kicker">{say("kicker")}</p>
          <h1>{say("title")}</h1>
          <p>{say("lead")}</p>
          <label className="pub-search">
            <Icon name="search" size={16} />
            <input aria-label={say("searchLabel")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={say("searchPlaceholder")} />
          </label>
          <div className="pub-chips">
            <span>{say("popular")}</span>
            {copyRows(page, "page.help", "chips").map((item) => { const id = item.id; const label = item.label; return (
              <button key={id} className={topic === id ? "active" : ""} type="button" onClick={() => setTopic(topic === id ? "all" : id)}>{label}</button>
            ); })}
          </div>
          </div>
          <img className="help-bubbles" src="/marketing/help-bubbles.png" alt="" />
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-help">
          <aside>
            <h2>{say("topicsTitle")}</h2>
            <div className="pub-topics">
              {topics.map((item, index) => (
                <button key={item.id} className={topic === item.id ? "active" : ""} type="button" onClick={() => setTopic(item.id)}><Icon name={TOPIC_ICONS[index] || "menu"} size={16} /> {item.label}</button>
              ))}
            </div>
            <article className="pub-card help-side" style={{ marginTop: 16 }}>
              <span className="cost-ico"><Icon name="headset" size={16} /></span>
              <h3>{say("sideTitle")}</h3>
              <p>{say("sideBody")}</p>
              <Link className="btn btn-secondary" href={say("sideHref")}>{say("sideCta")}</Link>
            </article>
          </aside>
          <div>
            <h2>{say("questionsTitle")}</h2>
            <p>{shown.length === 0 ? say("empty") : say("questionsLead")}</p>
            {shown.map((item, index) => (
              <details key={item.title} className={`pub-q${index === 0 ? " open" : ""}`} open={index === 0}>
                <summary>{item.title}</summary>
                <p>{item.body}</p>
                {item.href ? <p><Link href={item.href}>{item.link || "Read more →"}</Link></p> : null}
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap pub-grid-3">
          {copyRows(page, "page.help", "jumps").map((item, index) => (
            <article key={item.title} className="pub-card help-jump"><span className={`cost-ico${index === 1 ? " coral" : ""}`}><Icon name={["book", "chart", "phone"][index] || "book"} size={16} /></span><h3>{item.title}</h3><p>{item.body}</p><Link href={item.href}>{item.link}</Link></article>
          ))}
        </div>
      </section>
      <section className="help-ask">
        <div className="wrap">
          <div><img className="ask-art" src="/marketing/help-bubbles.png" alt="" /><div><h2>{say("askTitle")}</h2><p>{say("askBody")}</p></div></div>
          <div className="pub-actions">
            <Link className="btn btn-primary" href={say("askHref")}>{say("askCta")}</Link>
            <Link className="btn btn-secondary" href={say("askSecondaryHref")}>{say("askSecondary")}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
