"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/account/actions";
import { screenFor } from "@/lib/admin-labels";
import { websiteArea } from "@/lib/admin-website";

type Group = { title: string; links: { label: string; href: string }[] };

function active(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  if (href === "/admin/website") return websiteArea(path);
  if (href === "/admin/tickets") return path === "/admin/tickets" || (path.startsWith("/admin/tickets/") && !path.startsWith("/admin/tickets/settings"));
  return path === href || path.startsWith(`${href}/`);
}

function crumb(path: string, groups: Group[]) {
  if (path === "/admin") return ["Overview"];
  if (path.startsWith("/admin/content/plans/edit")) return ["Catalog & billing", "Plans", "Edit plan"];
  if (path.startsWith("/admin/content/")) {
    const key = path.slice("/admin/content/".length).split("/")[0];
    const catalog = key === "plans" || key === "minute_bundles";
    return [catalog ? "Catalog & billing" : "Website & content", screenFor(key).title];
  }
  if (path.startsWith("/admin/website")) return ["Website & content"];
  if (path.startsWith("/admin/theme") || path.startsWith("/admin/media") || path.startsWith("/admin/faq")) return ["Website & content", screenFor(path.split("/")[2] || "").title];
  for (const group of groups) {
    const link = group.links.find((item) => active(path, item.href));
    if (link) return [group.title, link.label];
  }
  return ["Admin"];
}

export function AdminFrame({
  name,
  email,
  groups,
  trunkAlerts = 0,
  children,
}: {
  name: string;
  email: string;
  groups: Group[];
  trunkAlerts?: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const links = useMemo(() => [{ label: "Overview", href: "/admin" }, ...groups.flatMap((group) => group.links)], [groups]);
  const matches = links.filter((link) => link.label.toLowerCase().includes(query.trim().toLowerCase()));
  const trail = crumb(path, groups);
  const initials = name.trim().split(/\s+/).filter(Boolean);
  const mark = initials.length === 0 ? "SC" : initials.length === 1 ? initials[0].slice(0, 2).toUpperCase() : `${initials[0][0]}${initials[initials.length - 1][0]}`.toUpperCase();
  useEffect(() => {
    if (!trunkAlerts) return;
    if (sessionStorage.getItem("sc-trunk-buzz") === String(trunkAlerts)) return;
    sessionStorage.setItem("sc-trunk-buzz", String(trunkAlerts));
    const context = new AudioContext();
    const tone = (frequency: number, at: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.12);
    };
    const start = context.currentTime + 0.05;
    tone(880, start);
    tone(660, start + 0.18);
    window.setTimeout(() => void context.close(), 800);
  }, [trunkAlerts]);

  return (
    <div className={`admin-portal${open ? " nav-open" : ""}`}>
      <aside className="ap-side">
        <Link className="ap-brand" href="/admin" onClick={() => setOpen(false)}>
          <span className="ap-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="32" height="32"><path d="M6 18c2.2-6 3.2-6 4.4 0s2.2 6 4.4 0 2.2-6 4.4 0 2.2 6 4.4 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </span>
          <span>SautiCall<small>Admin portal</small></span>
        </Link>
        <nav className="ap-nav" aria-label="Admin">
          <Link href="/admin" data-current={path === "/admin" ? "true" : undefined} onClick={() => setOpen(false)}>Overview</Link>
          {groups.map((group) => (
            <div key={group.title} className="ap-group">
              <h2>{group.title}</h2>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href} data-current={active(path, link.href) ? "true" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open ? <button className="ap-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <div className="ap-main">
        <header className="ap-top">
          <button className="ap-menu" type="button" aria-label="Open menu" onClick={() => setOpen(true)}>Menu</button>
          <p className="ap-crumb">{trail.map((part, index) => <span key={part}>{index ? " / " : ""}{index === trail.length - 1 ? <strong>{part}</strong> : part}</span>)}</p>
          <form className="ap-search" onSubmit={(event) => { event.preventDefault(); if (matches[0]) window.location.href = matches[0].href; }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin" aria-label="Search admin" />
            {query.trim() && matches.length ? (
              <div className="ap-search-list">
                {matches.map((link) => <Link key={link.href} href={link.href} onClick={() => setQuery("")}>{link.label}</Link>)}
              </div>
            ) : null}
          </form>
          <div className="ap-user">
            <button type="button" className="ap-user-btn" onClick={() => setAccountOpen((value) => !value)}>
              <span>{mark}</span>
              <strong>{name}</strong>
            </button>
            {accountOpen ? (
              <div className="ap-user-menu">
                <p>{email}</p>
                <form action={logout}><button type="submit">Sign out</button></form>
              </div>
            ) : null}
          </div>
        </header>
        {trunkAlerts ? (
          <Link className="ap-buzzer" href="/admin/lines" role="status">
            <span className="ap-buzzer-dot" aria-hidden="true" />
            <strong>{trunkAlerts === 1 ? "1 trunk needs attention" : `${trunkAlerts} trunks need attention`}</strong>
            <span>A customer is waiting. Open Lines & trunks and finish the connection.</span>
          </Link>
        ) : null}
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
