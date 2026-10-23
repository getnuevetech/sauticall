import assert from "node:assert/strict";
import test from "node:test";
import { anyLanguageFeature, defaultPlans } from "../lib/seed-data.ts";
import { featureLabels, normalizePlans, planAllows } from "../lib/plan-features.ts";
import type { Plan } from "../lib/types.ts";

test("checkbox features replace text lists and inheritance", () => {
  const legacy: Plan[] = [
    { ...defaultPlans[0], features: ["Business number request", "Mobile & desktop softphone", "Voicemail and call forwarding"], multilingual: false, base: true, seats: undefined, units: "1 user / extension" },
    { ...defaultPlans[1], features: ["Everything in Solo", anyLanguageFeature, "Business-hour routing", "Ring groups and transfers"], multilingual: true, seats: undefined, units: "Up to 5 extensions" },
  ];
  const plans = normalizePlans(legacy);
  assert.deepEqual(plans[0].features, ["numbers", "softphone", "voicemail"]);
  assert.equal(plans[0].seats, 1);
  assert.equal(planAllows(plans[0], "ai"), false);
  assert.ok(plans[1].features.includes("numbers"));
  assert.ok(plans[1].features.includes("ai"));
  assert.ok(plans[1].features.includes("ai_any_language"));
  assert.ok(plans[1].features.includes("ring_groups"));
  assert.equal(plans[1].seats, 5);
  assert.equal(planAllows(plans[1], "ai"), true);
  assert.equal(planAllows(plans[1], "queues"), false);
});

test("saved checkbox plans stay as the admin left them", () => {
  const solo = normalizePlans([{ ...defaultPlans[0], features: ["numbers"], seats: 1, multilingual: true }])[0];
  assert.deepEqual(solo.features, ["numbers"]);
  assert.equal(planAllows(solo, "ai"), false);
  assert.equal(solo.multilingual, false);
  assert.deepEqual(featureLabels(["ai", "queues"]), ["Call queues", "AI receptionist"]);
});
