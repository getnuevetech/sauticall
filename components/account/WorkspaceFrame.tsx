"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/account/actions";
import { Icon } from "@/components/Icon";
import { accountNav, navIsActive, workspaceCrumb } from "@/lib/account-nav";

export function WorkspaceFrame({
  name,
  email,
  company,
  alerts,
  children,
}: {
  name: string;
  email: string;
  company: string;
  alerts: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const crumb = workspaceCrumb(pathname);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const matches = accountNav.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const initials = name.trim().split(/\s+/).filter(Boolean);
  const mark = initials.length === 0 ? "SC" : initials.length === 1 ? initials[0].slice(0, 2).toUpperCase() : `${initials[0][0]}${initials[initials.length - 1][0]}`.toUpperCase();

  return (
    <div className={`workspace${open ? " nav-open" : ""}`}>
      <aside className="ws-side">
        <Link className="ws-brand" href="/account" onClick={() => setOpen(false)}>
          <span className="brand-mark"><span className="mark-wave" /><span className="mark-wave" /><span className="mark-wave" /></span>
          <span>Sauti<span className="brand-accent">Call</span></span>
        </Link>
        <p className="ws-kicker">Workspace</p>
        <div className="ws-company">{company}</div>
        <nav className="ws-nav">
          {accountNav.map((item) => (
            <Link key={item.href} href={item.href} className={navIsActive(pathname, item.href, item.exact) ? "active" : ""} onClick={() => setOpen(false)}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ws-user">
          <button type="button" className="ws-user-btn" onClick={() => setAccountOpen((value) => !value)}>
            <span className="ws-avatar">{mark}</span>
            <span>
              <strong>{name}</strong>
              <small>{email}</small>
            </span>
            <Icon name="arrowdown" size={16} />
          </button>
          {accountOpen ? (
            <div className="ws-user-menu">
              <Link href="/account/security" onClick={() => setAccountOpen(false)}>Settings</Link>
              <form action={logout}><button type="submit">Sign out</button></form>
            </div>
          ) : null}
        </div>
      </aside>
      {open ? <button className="ws-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <div className="ws-main">
        <header className="ws-top">
          <button className="ws-menu" type="button" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" size={18} /></button>
          <p className="ws-crumb"><span>{crumb.parent}</span> / <strong>{crumb.current}</strong></p>
          <form className="ws-search" action="/account/tickets" onSubmit={(event) => { if (matches[0]) { event.preventDefault(); window.location.href = matches[0].href; } }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings, numbers, or help..." aria-label="Search the account" />
            {query.trim() && matches.length > 0 ? (
              <div className="ws-search-list">
                {matches.map((item) => <Link key={item.href} href={item.href} onClick={() => setQuery("")}>{item.label}</Link>)}
              </div>
            ) : null}
          </form>
          <Link className="ws-bell" href="/account/tickets" aria-label={alerts ? `${alerts} open support tickets` : "Support"}>
            <Icon name="message" size={18} />
            {alerts > 0 ? <span /> : null}
          </Link>
          <span className="ws-avatar">{mark}</span>
        </header>
        <div className="ws-content">{children}</div>
      </div>
    </div>
  );
}
