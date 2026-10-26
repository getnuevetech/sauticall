"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { refreshMinutes, startBundleCheckout } from "@/app/account/actions";
import { callDuration, chicagoClock, formatPhone, perMinute, wholeMoney } from "@/lib/account-display";
import { Icon } from "@/components/Icon";

type Bundle = { name: string; minutes: number; price: number };
type Call = { id: string; destination: string; seconds: number; startedAt: string };
type Mailbox = { id: number; number: string; name: string };
type Gateway = { id: number; label: string };

export function CallsVoicemail({
  initialTab,
  included,
  used,
  remaining,
  bundleLeft,
  syncedLabel,
  checkout,
  bundles,
  gateways,
  calls,
  mailboxes,
  notice,
}: {
  initialTab: string;
  included: number;
  used: number;
  remaining: number;
  bundleLeft: number;
  syncedLabel: string;
  checkout: boolean;
  bundles: Bundle[];
  gateways: Gateway[];
  calls: Call[];
  mailboxes: Mailbox[];
  notice: string;
}) {
  const [tab, setTab] = useState(initialTab === "history" || initialTab === "voicemail" || initialTab === "settings" ? initialTab : "minutes");
  const [picked, setPicked] = useState(bundles[bundles.length - 1]?.name || "");
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id || 0);
  const [query, setQuery] = useState("");
  const mailbox = mailboxes.find((item) => item.id === mailboxId) || mailboxes[0];
  const visibleCalls = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return calls;
    return calls.filter((call) => formatPhone(call.destination).toLowerCase().includes(needle) || call.destination.includes(needle));
  }, [calls, query]);
  const bundle = bundles.find((item) => item.name === picked);

  return (
    <div className="cv-page">
      <header className="num-head">
        <div>
          <h1>Calls & voicemail</h1>
          <p>Track your minutes and manage voice messages in one place.</p>
        </div>
      </header>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      <div className="num-tabs">
        <button type="button" className={tab === "minutes" ? "active" : ""} onClick={() => setTab("minutes")}>Minutes & bundles</button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Call history</button>
        <button type="button" className={tab === "voicemail" ? "active" : ""} onClick={() => setTab("voicemail")}>Voicemail</button>
        <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Voicemail settings</button>
      </div>

      {tab === "minutes" ? (
        <>
          <div className="cv-stats">
            <article>
              <span>Plan minutes remaining</span>
              <strong>{remaining.toLocaleString("en-US")}</strong>
              <p>{used.toLocaleString("en-US")} of {included.toLocaleString("en-US")} used · Current plan period</p>
            </article>
            <article>
              <span>Bundle minutes remaining</span>
              <strong>{bundleLeft.toLocaleString("en-US")}</strong>
              <p>Purchased minutes stay until used</p>
            </article>
            <article>
              <span>Outbound minutes used</span>
              <strong>{used.toLocaleString("en-US")}</strong>
              <p>Current plan period</p>
            </article>
          </div>
          <div className="cv-sync">
            <span>{syncedLabel}</span>
            <form action={refreshMinutes}><button type="submit">Refresh balance</button></form>
          </div>
          <section className="num-card">
            <h2>Buy extra minutes</h2>
            <p>One-time bundles. Select a bundle to review your purchase.</p>
            {!checkout ? <p>Buying extra minutes is turned off.</p> : null}
            {checkout && bundles.length === 0 ? <p>No minute bundles are available right now.</p> : null}
            <div className="cv-bundles">
              {bundles.map((item) => {
                const active = item.name === picked;
                return (
                  <article key={item.name} className={active ? "active" : ""}>
                    <h3>{item.minutes.toLocaleString("en-US")} minutes</h3>
                    <p className="cv-price">{wholeMoney(item.price)}</p>
                    <p>{perMinute(item.price, item.minutes)}</p>
                    <button type="button" className={active ? "ws-btn primary" : "ws-btn ghost num-outline"} onClick={() => setPicked(item.name)}>{active ? "Selected" : "Select bundle"}</button>
                  </article>
                );
              })}
            </div>
            {checkout && bundle && gateways.length === 0 ? <p>A way to pay is not ready yet.</p> : null}
            {checkout && bundle ? gateways.map((gateway) => (
              <form key={gateway.id} action={startBundleCheckout} className="cv-pay">
                <input type="hidden" name="bundle" value={bundle.name} />
                <input type="hidden" name="gatewayId" value={gateway.id} />
                <button className="ws-btn primary" type="submit">Pay {wholeMoney(bundle.price)} with {gateway.label}</button>
              </form>
            )) : null}
            <p>Review eligible destinations, applicable charges, and the final total before paying.</p>
          </section>
          <div className="cv-note">
            <span className="num-ico"><Icon name="shield" size={16} /></span>
            <div>
              <strong>Keep your calls going</strong>
              <p>A low-balance state shows here when the minutes left on this period run low.</p>
            </div>
          </div>
          <p><Link href="/account/billing">View billing & invoices</Link></p>
        </>
      ) : null}

      {tab === "history" ? (
        <section className="num-card">
          <div className="num-results-head">
            <div>
              <h2>Call history</h2>
              <p>Outbound calls that counted toward minutes.</p>
            </div>
            <label className="num-sort">Search
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Number called" />
            </label>
          </div>
          <table className="num-table">
            <thead><tr><th>Number called</th><th>When</th><th>Duration</th></tr></thead>
            <tbody>
              {visibleCalls.length === 0 ? <tr><td colSpan={3}>No outbound calls are stored for this account yet.</td></tr> : visibleCalls.map((call) => (
                <tr key={call.id}>
                  <td>{formatPhone(call.destination) || call.destination || "Unknown number"}</td>
                  <td>{chicagoClock(call.startedAt)} CT</td>
                  <td>{callDuration(call.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "voicemail" ? (
        <div className="cv-mail">
          <section className="num-card">
            <h2>Voicemail</h2>
            <p>Messages stay in the phone app. SautiCall keeps the mailbox for each person and does not store a copy of each recording.</p>
            {mailboxes.length === 0 ? <p>Add a person on the phone system. Their mailbox is created with the extension.</p> : (
              <label>Mailbox
                <select value={mailbox?.id || ""} onChange={(event) => setMailboxId(Number(event.target.value))}>
                  {mailboxes.map((item) => <option key={item.id} value={item.id}>{item.name} · Ext. {item.number}</option>)}
                </select>
              </label>
            )}
            <div className="cv-empty">
              <strong>No messages in SautiCall</strong>
              <p>{mailbox ? `Open the phone app for extension ${mailbox.number} to listen and delete messages.` : "A mailbox appears here after a person is added."}</p>
            </div>
          </section>
          <aside>
            <section className="num-card">
              <h2>Mailbox settings</h2>
              {mailbox ? <p>Extension {mailbox.number}<br />{mailbox.name}</p> : <p>No mailbox selected.</p>}
              <p>Greeting</p>
              <p>The phone app uses its default greeting until a greeting is recorded there.</p>
              <Link className="ws-btn ghost num-outline" href="/account/phone">Manage on the phone system</Link>
            </section>
            <section className="num-card">
              <h2>After-hours routing</h2>
              <p>After the saved business hours, calls go to voicemail.</p>
              <Link href="/account/phone">View call routing</Link>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "settings" ? (
        <section className="num-card">
          <h2>Voicemail settings</h2>
          <p>Greetings and message playback stay in the phone app for each extension.</p>
          <p>Setup email for a new person is sent without the app password. Ticket replies go to the email on this account.</p>
          <p>After-hours routing is saved with business hours on the phone system.</p>
          <Link className="ws-btn ghost num-outline" href="/account/phone">Open phone system</Link>
        </section>
      ) : null}
    </div>
  );
}
