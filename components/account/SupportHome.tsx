"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { HelpTopic } from "@/lib/account-display";
import { Icon } from "@/components/Icon";

type Article = { id: string; category: HelpTopic; title: string; body: string; href?: string; link?: string };
type Ticket = { id: number; subject: string; status: string; when: string };

const TOPICS: { id: "all" | HelpTopic; label: string }[] = [
  { id: "all", label: "All" },
  { id: "started", label: "Getting started" },
  { id: "numbers", label: "Numbers" },
  { id: "billing", label: "Billing" },
  { id: "phone", label: "Phone system" },
];

export function SupportHome({ articles, tickets, initialTab }: { articles: Article[]; tickets: Ticket[]; initialTab: string }) {
  const [tab, setTab] = useState(initialTab === "tickets" ? "tickets" : "help");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(articles[0]?.id || "");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (topic !== "all" && article.category !== topic) return false;
      if (!needle) return true;
      return `${article.title} ${article.body}`.toLowerCase().includes(needle);
    });
  }, [articles, query, topic]);

  return (
    <div className="sup-page">
      <header className="num-head">
        <div>
          <h1>How can we help?</h1>
          <p>Find answers, follow a ticket, or get help from our team.</p>
        </div>
        <Link className="ws-btn primary" href="/account/tickets/new">+ New ticket</Link>
      </header>
      <section className="num-card sup-search">
        <h2>Search FAQs and help articles</h2>
        <label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Try "transfer a number" or "set up voicemail"' />
        </label>
      </section>
      <div className="num-tabs">
        <button type="button" className={tab === "help" ? "active" : ""} onClick={() => setTab("help")}>Help & FAQs</button>
        <button type="button" className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}>My tickets</button>
      </div>
      {tab === "tickets" ? <TicketList tickets={tickets} /> : (
        <div className="sup-layout">
          <section className="num-card">
            <h2>Frequently asked questions</h2>
            <div className="sup-topics">
              {TOPICS.map((item) => (
                <button key={item.id} type="button" className={topic === item.id ? "active" : ""} onClick={() => setTopic(item.id)}>{item.label}</button>
              ))}
            </div>
            {shown.length === 0 ? <p>No articles match that search.</p> : shown.map((article) => {
              const expanded = open === article.id;
              return (
                <article key={article.id} className={expanded ? "sup-faq open" : "sup-faq"}>
                  <button type="button" onClick={() => setOpen(expanded ? "" : article.id)}>
                    <span>{article.title}</span>
                    <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
                  </button>
                  {expanded ? (
                    <div>
                      <p>{article.body}</p>
                      {article.href ? <Link href={article.href}>{article.link || "Open"}</Link> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
          <aside>
            <TicketList tickets={tickets} compact />
            <section className="num-card sup-help">
              <span className="num-ico"><Icon name="headset" size={16} /></span>
              <h2>Need help with setup?</h2>
              <p>Tell us what you are trying to do and we will help you find the next step.</p>
              <Link href="/account/tickets/new">Contact support</Link>
            </section>
          </aside>
        </div>
      )}
      <p className="sup-foot"><span className="num-ico"><Icon name="message" size={16} /></span> Track every conversation. Tickets include a reference number, status, and reply history.</p>
    </div>
  );
}

function TicketList({ tickets, compact }: { tickets: Ticket[]; compact?: boolean }) {
  return (
    <section className="num-card">
      <h2>Your tickets</h2>
      {tickets.length === 0 ? (
        <div className="cv-empty">
          <strong>No tickets yet</strong>
          <p>When you contact us, track replies and progress here.</p>
          <Link className="ws-btn ghost num-outline" href="/account/tickets/new">Create a ticket</Link>
        </div>
      ) : tickets.slice(0, compact ? 4 : tickets.length).map((ticket) => (
        <p key={ticket.id}><Link href={`/account/tickets/${ticket.id}`}><strong>SC-{ticket.id}</strong> · {ticket.subject}</Link><br />{ticket.status} · {ticket.when}</p>
      ))}
      {compact && tickets.length > 4 ? <p><Link href="/account/tickets?tab=tickets">View all tickets</Link></p> : null}
    </section>
  );
}
