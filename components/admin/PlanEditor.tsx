"use client";

import { useState } from "react";
import { savePlans } from "@/app/admin/actions";
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
    seats: 1,
    features: ["numbers", "softphone", "voicemail"],
    note: "",
    popular: false,
    ctaLabel: "Choose this plan",
    ctaHref: "/account/billing",
  };
}

export function PlanEditor({ initial }: { initial: Plan[] }) {
  const [plans, setPlans] = useState(initial);
  const [pending, setPending] = useState(false);
  const groups = [...new Set(PLAN_FEATURES.map((feature) => feature.group))];

  function update(index: number, patch: Partial<Plan>) {
    setPlans((current) => current.map((plan, item) => (item === index ? { ...plan, ...patch } : plan)));
  }

  function toggle(index: number, key: FeatureKey, checked: boolean) {
    setPlans((current) => current.map((plan, item) => {
      if (item !== index) return plan;
      const next = new Set(plan.features);
      if (checked) {
        next.add(key);
        if (key === "ai_any_language") next.add("ai");
      } else {
        next.delete(key);
        if (key === "ai") next.delete("ai_any_language");
      }
      return { ...plan, features: PLAN_FEATURES.map((feature) => feature.key).filter((feature) => next.has(feature)) };
    }));
  }

  return (
    <form action={async () => { setPending(true); await savePlans(JSON.stringify(plans)); }}>
      {plans.map((plan, index) => (
        <fieldset key={`${plan.name}-${index}`} className="plan-editor">
          <legend>{plan.name || `Plan ${index + 1}`}</legend>
          <div className="form-grid">
            <label>Name <input value={plan.name} onChange={(event) => update(index, { name: event.target.value })} required /></label>
            <label>Monthly price <input type="number" min={0} step="1" value={plan.custom ? 0 : plan.price} disabled={plan.custom} onChange={(event) => update(index, { price: Number(event.target.value) })} /></label>
            <label>People included <input type="number" min={0} step="1" value={plan.seats ?? 1} onChange={(event) => update(index, { seats: Number(event.target.value) })} /></label>
            <label>Outbound minutes each month <input type="number" min={0} step="1" value={plan.includedMinutes} onChange={(event) => update(index, { includedMinutes: Number(event.target.value) })} /></label>
          </div>
          <label>Short description <input value={plan.desc} onChange={(event) => update(index, { desc: event.target.value })} /></label>
          <label>Note on the pricing card <input value={plan.note} onChange={(event) => update(index, { note: event.target.value })} /></label>
          <label className="check-option"><input type="checkbox" checked={plan.popular} onChange={(event) => update(index, { popular: event.target.checked })} /> Mark as the popular plan</label>
          <label className="check-option"><input type="checkbox" checked={plan.custom} onChange={(event) => update(index, { custom: event.target.checked, price: event.target.checked ? 0 : plan.price })} /> Custom plan, no public price</label>
          {groups.map((group) => (
            <div key={group}>
              <h3>{group}</h3>
              <div className="check-list">
                {PLAN_FEATURES.filter((feature) => feature.group === group).map((feature) => (
                  <label key={feature.key}>
                    <input type="checkbox" checked={plan.features.includes(feature.key)} onChange={(event) => toggle(index, feature.key, event.target.checked)} />
                    <span><b>{feature.label}</b><small>{feature.detail}</small></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {plans.length > 1 ? <button type="button" className="btn btn-secondary" onClick={() => setPlans((current) => current.filter((_, item) => item !== index))}>Remove this plan</button> : null}
        </fieldset>
      ))}
      <div className="cta-pair">
        <button type="button" className="btn btn-secondary" onClick={() => setPlans((current) => [...current, blankPlan()])}>Add a plan</button>
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save plans"}</button>
      </div>
    </form>
  );
}
