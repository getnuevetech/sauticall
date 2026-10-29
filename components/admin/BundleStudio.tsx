"use client";

import { useState, useTransition } from "react";
import { saveBundles } from "@/app/admin/actions";
import { bundleImpact, catalogMoney, pricePerMinute, type BundleOffer } from "@/lib/catalog";

function same(left: BundleOffer, right: BundleOffer) {
  return left.name === right.name && left.minutes === right.minutes && left.price === right.price && left.enabled === right.enabled;
}

export function BundleStudio({
  initial,
  purchases,
  currency,
  currencyChoices,
}: {
  initial: BundleOffer[];
  purchases: Record<string, number>;
  currency: string;
  currencyChoices: string[];
}) {
  const [bundles] = useState(initial);
  const [index, setIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<BundleOffer | null>(null);
  const [review, setReview] = useState(false);
  const [pending, startTransition] = useTransition();
  const before = index != null && index < bundles.length ? bundles[index] : null;
  const dirty = Boolean(draft && (before ? !same(before, draft) : true));
  const impact = draft ? bundleImpact({ before, after: draft, purchases: before ? purchases[before.name] || 0 : 0 }) : [];

  function open(next: number) {
    if (dirty) return;
    setReview(false);
    setIndex(next);
    setDraft({ ...bundles[next] });
  }

  function add() {
    if (dirty) return;
    setReview(false);
    setIndex(bundles.length);
    setDraft({ name: "", minutes: 100, price: 10, enabled: true });
  }

  function close() {
    setIndex(null);
    setDraft(null);
    setReview(false);
  }

  function confirm() {
    if (!draft) return;
    const next = index != null && index < bundles.length
      ? bundles.map((bundle, item) => (item === index ? draft : bundle))
      : [...bundles, draft];
    startTransition(() => {
      void saveBundles(JSON.stringify(next));
    });
  }

  return (
    <div className={`ops${draft ? "" : " ops-single"}`}>
      <div>
        <div className="ops-head">
          <div>
            <h1>Minute bundles</h1>
            <p>Manage extra outbound minutes customers can purchase.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={add}>+ Add bundle</button>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Bundle</th><th>Minutes</th><th>Price</th><th>Availability</th><th>Action</th></tr></thead>
            <tbody>
              {bundles.length === 0 ? <tr><td colSpan={5}>No bundles yet.</td></tr> : null}
              {bundles.map((bundle, item) => (
                <tr key={bundle.name} data-current={index === item ? "true" : undefined}>
                  <td><strong>{bundle.name}</strong></td>
                  <td>{bundle.minutes.toLocaleString("en-US")}</td>
                  <td>{catalogMoney(bundle.price, currency)}</td>
                  <td><span className={`ops-badge ${bundle.enabled ? "ok" : "muted"}`}>{bundle.enabled ? "Available" : "Hidden"}</span></td>
                  <td><button type="button" className="btn btn-secondary" onClick={() => open(item)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ops-banner">
          <strong>Catalog changes do not directly add or remove customer minute balances.</strong>
          <p>These bundles are available for customers to purchase. When a customer buys a bundle, the minutes are credited after the payment is confirmed and remain until they are used.</p>
        </div>
      </div>
      {draft && index != null ? (
        <aside className="ops-drawer">
          <div className="ops-drawer-head">
            <h2>{before ? "Edit bundle" : "Add bundle"}</h2>
            <button type="button" aria-label="Close" onClick={close}>×</button>
          </div>
          <label className="ops-stack">Bundle name <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="ops-stack">Minutes <input type="number" min={0} step="1" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: Number(event.target.value) })} /></label>
          <label className="ops-stack">Price
            <span className="ops-inline">
              <input type="number" min={0} step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} />
              <span className="ops-badge">{currency}</span>
            </span>
          </label>
          {currencyChoices.length > 1 ? <p className="ops-muted">Checkout charges the currency of the gateway the customer uses. This price is stored as a number.</p> : null}
          <div className="ops-feature">
            <div>
              <strong>Availability</strong>
              <p>Customers can buy this bundle. Turn off to hide this offer from new purchases.</p>
            </div>
            <label className="ap-switch">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              <span>{draft.enabled ? "On" : "Off"}</span>
            </label>
          </div>
          <div className="ops-card">
            <strong>Entitlement rule</strong>
            <p>Purchased minutes remain until used.</p>
            <p className="ops-muted">Preserve existing expiry and crediting behavior.</p>
          </div>
          <p>Price per minute</p>
          <p><strong>{pricePerMinute(draft.price, draft.minutes, currency) || "—"}</strong></p>
          <p className="ops-muted">Derived from bundle price and minutes. Read-only.</p>
          {review ? (
            <div className="ops-banner">
              {impact.map((line) => <p key={line}>{line}</p>)}
              <div className="ops-inline">
                <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
                <button type="button" className="btn btn-primary" disabled={pending || !draft.name.trim()} onClick={confirm}>{pending ? "Saving" : "Confirm save"}</button>
              </div>
            </div>
          ) : (
            <div className="ops-inline">
              <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!dirty || !draft.name.trim()} onClick={() => setReview(true)}>Save changes</button>
            </div>
          )}
          {before?.enabled ? (
            <div className="ops-danger">
              <button type="button" className="btn btn-danger" onClick={() => { setDraft({ ...draft, enabled: false }); setReview(true); }}>Remove bundle</button>
              <p className="ops-muted">This hides the bundle from new purchases. Linked purchase history and customer minute balances are retained and cannot be deleted.</p>
            </div>
          ) : before ? <p className="ops-muted">This bundle is already hidden. Turn availability on to offer it again.</p> : null}
        </aside>
      ) : null}
    </div>
  );
}
