import assert from "node:assert/strict";
import test from "node:test";
import { recommendPlan, readSetupNeed } from "../lib/setup-assistant.ts";
import { planSignupPath } from "../lib/signup.ts";
import type { Plan } from "../lib/types.ts";

const plans: Plan[] = [
  { name: "Solo", price: 19, custom: false, base: false, multilingual: false, includedMinutes: 200, seats: 1, priceLabel: "", desc: "", units: "", features: ["numbers", "softphone", "voicemail"], note: "", popular: false, ctaLabel: "", ctaHref: "" },
  { name: "Small Business", price: 39, custom: false, base: false, multilingual: true, includedMinutes: 800, seats: 5, priceLabel: "", desc: "", units: "", features: ["numbers", "porting", "softphone", "ai", "ai_any_language", "ring_groups"], note: "", popular: true, ctaLabel: "", ctaHref: "" },
  { name: "Team", price: 79, custom: false, base: false, multilingual: true, includedMinutes: 2000, seats: 10, priceLabel: "", desc: "", units: "", features: ["numbers", "porting", "queues", "ai", "ai_any_language"], note: "", popular: false, ctaLabel: "", ctaHref: "" },
  { name: "Custom", price: 0, custom: true, base: false, multilingual: true, includedMinutes: 0, seats: 0, priceLabel: "Custom", desc: "", units: "", features: ["ai"], note: "", popular: false, ctaLabel: "", ctaHref: "/custom" },
];

test("a one-person description stays on the plan without AI", () => {
  assert.equal(readSetupNeed("just me, a business number").people, 1);
  assert.equal(recommendPlan(plans, "just me, a business number")?.planName, "Solo");
});

test("AI and a kept number choose the plan that includes both", () => {
  const advice = recommendPlan(plans, "4 people, an AI receptionist, and keep our number");
  assert.equal(advice?.planName, "Small Business");
  assert.match(advice?.href || "", /\/account\/register\?plan=Small\+Business/);
  assert.match(planSignupPath("Team", "queues"), /plan=Team/);
});

test("a large queue request goes to the custom form", () => {
  const advice = recommendPlan(plans, "20 agents and a call queue");
  assert.equal(advice?.custom, true);
  assert.match(advice?.href || "", /^\/custom\?setup=/);
});
