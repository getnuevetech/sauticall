"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { savePlans } from "@/app/admin/actions";
import { catalogMoney, planChanges, planImpact } from "@/lib/catalog";
import { PLAN_FEATURES, type FeatureKey } from "@/lib/plan-features";
import type { Plan } from "@/lib/types";

function blankPlan(): Plan {
  return {
    name: "",
    price: 0,
    custom: false,
    base: false,
    multilingual: false,
    priceLabel: "",
    desc: "",
    units: "1 person",
    includedMinutes: 0,
    carrierCredit: 0,
    seats: 1,
    features: ["numbers", "softphone", "voicemail"],
    note: "",
    popular: false,
    ctaLabel: "Choose this plan",
    ctaHref: "/account/billing",
  };
}

export function PlanStudio({
  plans,
  initial,
  creating,
  subscribers,
  currency,
  currencyChoices,
  fundEnabled,
}: {
  plans: Plan[];
  initial: Plan | null;
  creating: boolean;
  subscribers: number;
  currency: string;
  currencyChoices: string[];
  fundEnabled: boolean;
}) {
  const saved = initial || blankPlan();
  const [draft, setDraft] = useState(saved);
  const [tab, setTab] = useState<"pricing" | "features" | "presentation" | "funding">("pricing");
  const [review, setReview] = useState(false);
  const [pending, startTransition] = useTransition();
  const changes = planChanges(creating ? null : saved, draft);
  const impact = planImpact({ before: creating ? null : saved, after: draft, subscribers, fundEnabled });
  const groups = [...new Set(PLAN_FEATURES.map((feature) => feature.group))];

  function patch(next: Partial<Plan>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function toggle(key: FeatureKey, checked: boolean) {
    setDraft((current) => {
      const next = new Set(current.features);
      if (checked) {
        next.add(key);
        if (key === "ai_any_language") next.add("ai");
      } else {
        next.delete(key);
        if (key === "ai") next.delete("ai_any_language");
      }
      return { ...current, features: PLAN_FEATURES.map((feature) => feature.key).filter((feature) => next.has(feature)) };
    });
  }

  function confirm() {
    const name = draft.name.trim();
    if (!name || duplicate) return;
    const next = creating ? [...plans, { ...draft, name }] : plans.map((plan) => (plan.name === saved.name ? { ...draft, name } : plan));
    startTransition(() => {
      void savePlans(JSON.stringify(next));
    });
  }

  const duplicate = plans.some((plan) => plan.name.toLowerCase() === draft.name.trim().toLowerCase() && (creating || plan.name !== saved.name));
  const price = draft.custom ? "Custom" : `${catalogMoney(draft.price, currency)}/month`;

  return (
    <div>
      <p className="ops-kicker"><Link href="/admin/content/plans">Plans</Link> / {draft.name || "New plan"}</p>
      <div className="ops-head">
        <h1>{creating ? "Add plan" : `Edit ${saved.name}`}</h1>
        <Link href="/pricing">View public plan preview</Link>
      </div>
      <p>Changes are staged until you save.</p>
      <div className="ops-stats">
        <div><span>Price</span><strong>{price}</strong></div>
        <div><span>Extensions</span><strong>{draft.seats ?? 0}</strong></div>
        <div><span>Monthly outbound minutes</span><strong>{draft.includedMinutes.toLocaleString("en-US")}</strong></div>
      </div>
      <div className={`ops${changes.length ? "" : " ops-single"}`}>
        <div>
          <nav className="ops-tabs">
            {([
              ["pricing", "Pricing & limits"],
              ["features", "Included features"],
              ["presentation", "Public presentation"],
              ["funding", "Provider funding"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" data-current={tab === id ? "true" : undefined} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          {tab === "pricing" ? (
            <section className="ops-card ops-stack">
              <label>Plan name <input value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
              <label>Monthly price <input type="number" min={0} step="1" value={draft.custom ? 0 : draft.price} disabled={draft.custom} onChange={(event) => patch({ price: Number(event.target.value) })} /></label>
              <label>Extensions included <input type="number" min={0} max={500} step="1" value={draft.seats ?? 1} onChange={(event) => patch({ seats: Number(event.target.value) })} /></label>
              <p className="ops-muted">This is how many people the plan can add, up to 500. It is not the list size sent to the phone system.</p>
              <label>Outbound minutes each month <input type="number" min={0} step="1" value={draft.includedMinutes} onChange={(event) => patch({ includedMinutes: Number(event.target.value) })} /></label>
            </section>
          ) : null}
          {tab === "features" ? (
            <section className="ops-card">
              <h2>Included features</h2>
              <p>Select the features included in this plan. An AI system is available only to customers on a plan where that system is checked.</p>
              {groups.map((group) => (
                <div key={group} className="ops-stack">
                  <h3>{group}</h3>
                  {PLAN_FEATURES.filter((feature) => feature.group === group).map((feature) => {
                    const on = draft.features.includes(feature.key);
                    const was = saved.features.includes(feature.key);
                    return (
                      <div key={feature.key} className="ops-feature">
                        <div>
                          <strong>{feature.label}</strong>
                          <p>{feature.detail}</p>
                          {feature.key === "ai_any_language" ? <p className="ops-muted">Turning this on also includes the AI receptionist.</p> : null}
                          {on !== was ? <span className="ap-unsaved">Unsaved</span> : null}
                        </div>
                        <label className="ap-switch">
                          <input type="checkbox" checked={on} onChange={(event) => toggle(feature.key, event.target.checked)} />
                          <span>{on ? "On" : "Off"}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ) : null}
          {tab === "presentation" ? (
            <section className="ops-card ops-stack">
              <h2>Public presentation</h2>
              <p>Control how this plan is shown in customer-facing materials.</p>
              <div className="ops-feature">
                <div><strong>Popular plan</strong><p>Mark this plan on the public pricing page.</p></div>
                <label className="ap-switch"><input type="checkbox" checked={draft.popular} onChange={(event) => patch({ popular: event.target.checked })} /><span>{draft.popular ? "On" : "Off"}</span></label>
              </div>
              <div className="ops-feature">
                <div><strong>Custom quote</strong><p>Hide the public price. Customers request this plan instead of checking out.</p></div>
                <label className="ap-switch"><input type="checkbox" checked={draft.custom} onChange={(event) => patch({ custom: event.target.checked, price: event.target.checked ? 0 : draft.price })} /><span>{draft.custom ? "On" : "Off"}</span></label>
              </div>
              <label>Short description <input value={draft.desc} onChange={(event) => patch({ desc: event.target.value })} /></label>
              <label>Note on the pricing card <input value={draft.note} onChange={(event) => patch({ note: event.target.value })} /></label>
              <label>Button label <input value={draft.ctaLabel} onChange={(event) => patch({ ctaLabel: event.target.value })} /></label>
              <label>Button link <input value={draft.ctaHref} onChange={(event) => patch({ ctaHref: event.target.value })} /></label>
            </section>
          ) : null}
          {tab === "funding" ? (
            <section className="ops-card ops-stack">
              <h2>Provider funding</h2>
              <p>Set the provider funding amount for this plan. Saving stores the amount. It does not add funds.</p>
              <label>Amount <input type="number" min={0} step="0.01" value={draft.carrierCredit || 0} onChange={(event) => patch({ carrierCredit: Number(event.target.value) })} /></label>
              <p>Currency <strong>{currency}</strong></p>
              {currencyChoices.length > 1 ? <p className="ops-muted">Checkout can charge {currencyChoices.join(", ")}. The amount above is stored as a number and is sent to the phone company only after a confirmed plan payment.</p> : <p className="ops-muted">Customer prices use {currency}. {fundEnabled ? "After a plan payment is confirmed, this amount can be added once to that customer’s phone-company account." : "Funding client accounts is turned off, so a confirmed payment does not add this amount."}</p>}
            </section>
          ) : null}
        </div>
        {changes.length ? (
          <aside className="ops-drawer">
            <h2>Change summary</h2>
            <p><strong>{changes.length} pending {changes.length === 1 ? "change" : "changes"}</strong></p>
            <ul className="ops-changes">
              {changes.map((change) => (
                <li key={change.label}><strong>{change.label}</strong><span>{change.from} → {change.to}</span></li>
              ))}
            </ul>
            <div className="ops-banner">
              <strong>Existing subscribers</strong>
              {impact.map((line) => <p key={line}>{line}</p>)}
            </div>
          </aside>
        ) : null}
      </div>
      {duplicate ? <p className="form-feedback form-error" role="alert">Another plan already uses that name.</p> : null}
      <div className="ap-savebar ops-save">
        <div>
          <strong>{changes.length ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}` : "No unsaved changes"}</strong>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => { setDraft(saved); setReview(false); }}>Discard</button>
        <button type="button" className="btn btn-primary" disabled={!changes.length || !draft.name.trim() || duplicate} onClick={() => setReview(true)}>Review & save</button>
      </div>
      {review ? (
        <div className="ap-modal-scrim">
          <div className="ap-modal" role="dialog" aria-modal="true" aria-labelledby="plan-review">
            <h2 id="plan-review">Review this plan</h2>
            <ul className="ops-changes">
              {changes.map((change) => <li key={change.label}><strong>{change.label}</strong><span>{change.from} → {change.to}</span></li>)}
            </ul>
            {impact.map((line) => <p key={line}>{line}</p>)}
            <div className="ap-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm}>{pending ? "Saving" : "Save plan"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
