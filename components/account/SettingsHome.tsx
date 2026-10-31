"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { saveDepartmentName, saveDisplayName, saveEmergencyAddress } from "@/app/account/actions";
import { personInitials } from "@/lib/account-display";
import { Icon } from "@/components/Icon";
import { AddressEditor } from "./AddressEditor";

type Person = { id: number; name: string; email: string; number: string; status: string };
type Tab = "overview" | "profile" | "business" | "team" | "notifications" | "security" | "preferences";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "My profile" },
  { id: "business", label: "Business profile" },
  { id: "team", label: "Team & access" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
];

export function SettingsHome({
  initialTab,
  name,
  email,
  company,
  rules,
  hasPlan,
  seats,
  used,
  people,
  mfaOn,
  mfaRequired,
  notice,
  noticeError = false,
  addressLine,
  address,
  lookup,
  children,
}: {
  initialTab: string;
  name: string;
  email: string;
  company: string;
  rules: string;
  hasPlan: boolean;
  seats: number;
  used: number;
  people: Person[];
  mfaOn: boolean;
  mfaRequired: boolean;
  notice: string;
  noticeError?: boolean;
  addressLine: string;
  address: {
    full_name: string;
    street_number: string;
    street_name: string;
    address_type: string;
    address_number: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  lookup: boolean;
  children: ReactNode;
}) {
  const allowed = TABS.some((item) => item.id === initialTab);
  const [tab, setTab] = useState<Tab>(allowed ? initialTab as Tab : "overview");
  const mfaLabel = mfaOn ? "On" : mfaRequired ? "Required" : "Not configured";

  return (
    <div className="set-page">
      <header className="num-head">
        <div>
          <h1>Settings</h1>
          <p>Manage your profile, business, and account preferences.</p>
        </div>
      </header>
      {notice ? <p className={noticeError ? "form-feedback form-error" : "form-feedback"} role={noticeError ? "alert" : "status"}>{notice}</p> : null}
      <div className="num-tabs">
        {TABS.map((item) => <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {tab === "overview" ? (
        <>
          <div className="set-grid">
            <button type="button" className="set-tile" onClick={() => setTab("profile")}>
              <span className="set-ico blue"><Icon name="users" size={18} /></span>
              <span><strong>My profile</strong><small>Name and contact details</small><em>Manage profile</em></span>
            </button>
            <button type="button" className="set-tile" onClick={() => setTab("business")}>
              <span className="set-ico violet"><Icon name="server" size={18} /></span>
              <span><strong>Business profile</strong><small>Company name used for the phone system</small><em>Manage business</em></span>
            </button>
            <button type="button" className="set-tile" onClick={() => setTab("team")}>
              <span className="set-ico green"><Icon name="users" size={18} /></span>
              <span><strong>Team & access</strong><small>{hasPlan ? `${used} of ${seats} ${seats === 1 ? "person" : "people"} on the phone system` : "People are added on the phone system"}</small><em>Manage access</em></span>
            </button>
            <button type="button" className="set-tile" onClick={() => setTab("notifications")}>
              <span className="set-ico amber"><Icon name="message" size={18} /></span>
              <span><strong>Notifications</strong><small>Ticket replies go to {email}</small><em>Manage notifications</em></span>
            </button>
            <button type="button" className="set-tile" onClick={() => setTab("security")}>
              <span className="set-ico rose"><Icon name="shield" size={18} /></span>
              <span><strong>Security</strong><small>Password, authenticator, and app-password reveal</small><b className={mfaOn ? "ok" : ""}>Two-factor authentication: {mfaLabel}</b><em>Manage security</em></span>
            </button>
            <button type="button" className="set-tile" onClick={() => setTab("preferences")}>
              <span className="set-ico lilac"><Icon name="settings" size={18} /></span>
              <span><strong>Preferences</strong><small>Times on this account use Central Time</small><em>Manage preferences</em></span>
            </button>
          </div>
          <section className="num-card set-links">
            <h2>Looking for service settings?</h2>
            <p>Extensions and routing are on the phone system. Emergency addresses are on Phone numbers. Plans are on Usage & billing.</p>
            <p><Link href="/account/phone">Go to Phone system</Link> <Link href="/account/numbers">Go to Phone numbers</Link> <Link href="/account/billing">Go to Usage & billing</Link></p>
          </section>
          <p className="sup-foot">Additional settings appear as features become available.</p>
        </>
      ) : null}

      {tab === "profile" ? (
        <section className="num-card set-form">
          <div className="set-person"><span className="ws-avatar">{personInitials(name)}</span><div><strong>{name}</strong><p>{email}</p></div></div>
          <form action={saveDisplayName}>
            <label>Name <input name="name" defaultValue={name} required maxLength={80} /></label>
            <label>Email <input value={email} readOnly /></label>
            <p>The sign-in email stays on this account. A profile photo is not stored.</p>
            <button className="ws-btn primary" type="submit">Save name</button>
          </form>
          <h2>Address</h2>
          <p>This address is one of the three confirmations on the account. Saving it updates the VoIP.ms client for this customer.</p>
          {addressLine ? <p>{addressLine}</p> : <p>No address is saved yet.</p>}
          <AddressEditor action={saveEmergencyAddress} next="profile" defaults={{ ...address, full_name: address.full_name || name }} lookup={lookup} submitLabel="Save address" />
        </section>
      ) : null}

      {tab === "business" ? (
        <section className="num-card set-form">
          <h2>Business profile</h2>
          <p>This name is the company department. People are added to it.</p>
          {!hasPlan ? <p>Choose a plan before saving a company name. <Link href="/account/billing/plan">View plans</Link></p> : (
            <form action={saveDepartmentName}>
              <input type="hidden" name="next" value="settings" />
              <label>Company name <input name="company_name" defaultValue={company} maxLength={50} required /></label>
              <p>{rules}</p>
              <button className="ws-btn primary" type="submit">Save company name</button>
            </form>
          )}
        </section>
      ) : null}

      {tab === "team" ? (
        <section className="num-card">
          <h2>Team & access</h2>
          <p>{hasPlan ? `This plan includes ${seats} ${seats === 1 ? "person" : "people"}. ${used} added.` : "A paid plan is required before people can be added."}</p>
          <p>People are added on the phone system. A separate invitation email is not sent from here.</p>
          {people.length === 0 ? <p>No people are on the phone system yet.</p> : people.map((person) => (
            <p key={person.id}><strong>{person.name}</strong> · Ext. {person.number} · {person.email} · {person.status}</p>
          ))}
          <Link className="ws-btn ghost num-outline" href="/account/phone">Open phone system</Link>
        </section>
      ) : null}

      {tab === "notifications" ? (
        <section className="num-card">
          <h2>Notifications</h2>
          <p>Ticket replies are sent to {email}.</p>
          <p>A new person’s setup email explains how to open the phone app. It does not include the app password.</p>
          <p>Bills and minute balances stay in Usage & billing and Calls & voicemail.</p>
          <Link href="/account/tickets">View support tickets</Link>
        </section>
      ) : null}

      {tab === "security" ? <section className="num-card set-security">{children}</section> : null}

      {tab === "preferences" ? (
        <section className="num-card">
          <h2>Preferences</h2>
          <p>Dates and times on this account are shown in Central Time.</p>
          <p>The account language is English. A separate display language is not stored.</p>
        </section>
      ) : null}
    </div>
  );
}
