import assert from "node:assert/strict";
import test from "node:test";
import { selectionAdvice } from "../lib/offerings.ts";
import { recommendPlan, readSetupNeed } from "../lib/setup-assistant.ts";
import { planSignupPath } from "../lib/signup.ts";
import type { Plan } from "../lib/types.ts";

const plans: Plan[] = [
  { name: "Solo", price: 19, custom: false, base: false, multilingual: false, includedMinutes: 200, carrierCredit: 5, seats: 1, priceLabel: "", desc: "", units: "", features: ["numbers", "softphone", "voicemail"], note: "", popular: false, ctaLabel: "", ctaHref: "" },
  { name: "Small Business", price: 39, custom: false, base: false, multilingual: true, includedMinutes: 800, carrierCredit: 10, seats: 5, priceLabel: "", desc: "", units: "", features: ["numbers", "porting", "softphone", "desk_phones", "ai", "ai_any_language", "ring_groups"], note: "", popular: true, ctaLabel: "", ctaHref: "" },
  { name: "Team", price: 79, custom: false, base: false, multilingual: true, includedMinutes: 2000, carrierCredit: 15, seats: 10, priceLabel: "", desc: "", units: "", features: ["numbers", "porting", "queues", "ai", "ai_any_language"], note: "", popular: false, ctaLabel: "", ctaHref: "" },
  { name: "Custom", price: 0, custom: true, base: false, multilingual: true, includedMinutes: 0, carrierCredit: 0, seats: 0, priceLabel: "Custom", desc: "", units: "", features: ["ai"], note: "", popular: false, ctaLabel: "", ctaHref: "/custom" },
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

test("the sample team request names the city, the extensions, AI, and sales routing", () => {
  const prompt = "I have a team of four. I'd like a Houston number, calls answered by AI, and sales transferred to my manager.";
  const advice = recommendPlan(plans, prompt);
  assert.equal(readSetupNeed(prompt).people, 4);
  assert.equal(advice?.planName, "Small Business");
  assert.deepEqual(advice?.points, ["Houston number", "4 extensions", "AI receptionist", "Sales call routing"]);
});

test("each product opens account setup on the plan that includes it", () => {
  assert.equal(selectionAdvice(plans, { product: "phone" })?.planName, "Solo");
  assert.equal(selectionAdvice(plans, { product: "ai", language: "1" })?.planName, "Small Business");
  assert.equal(selectionAdvice(plans, { product: "desk" })?.planName, "Small Business");
  assert.equal(selectionAdvice(plans, { product: "center" })?.planName, "Team");
  assert.match(selectionAdvice(plans, { product: "ai", people: "20", language: "1" })?.href || "", /^\/custom\?setup=/);
});

test("a large queue request goes to the custom form", () => {
  const advice = recommendPlan(plans, "20 agents and a call queue");
  assert.equal(advice?.custom, true);
  assert.match(advice?.href || "", /^\/custom\?setup=/);
});
