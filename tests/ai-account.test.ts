import assert from "node:assert/strict";
import test from "node:test";
import { aiConnectionStatus, systemsForPlan, validateAiExtension } from "../lib/ai-account.ts";
import { planAllows } from "../lib/plan-features.ts";

const solo = { name: "Solo", price: 19, custom: false, base: false, multilingual: false, includedMinutes: 200, carrierCredit: 5, seats: 1, priceLabel: "", desc: "", units: "", features: ["numbers", "softphone", "voicemail"], note: "", popular: false, ctaLabel: "", ctaHref: "" };
const small = { ...solo, name: "Small Business", features: ["numbers", "ai", "ai_any_language"] };

test("a plan includes only the AI systems an administrator checked", () => {
  const soloSystems = systemsForPlan(solo.features);
  assert.equal(soloSystems.every((item) => item.included === false), true);
  const smallSystems = systemsForPlan(small.features);
  assert.equal(smallSystems.find((item) => item.code === "receptionist")?.included, true);
  assert.equal(smallSystems.find((item) => item.code === "notifications")?.included, false);
  assert.equal(smallSystems.find((item) => item.code === "tts")?.included, false);
  assert.equal(planAllows(small, "ai"), true);
  assert.equal(planAllows(small, "ai_notifications"), false);
  assert.equal(planAllows(solo, "ai"), false);
});

test("an extension can become an AI extension only for a system on the plan", () => {
  const allowed = systemsForPlan(small.features).filter((item) => item.included).map((item) => item.code);
  const ordinary = validateAiExtension({ role: "", name: "", allowed });
  assert.equal(ordinary.ok && ordinary.role, "");
  const named = validateAiExtension({ role: "receptionist", name: "Front desk", allowed });
  assert.equal(named.ok && named.name, "Front desk");
  const missing = validateAiExtension({ role: "notifications", name: "Notices", allowed });
  assert.equal(missing.ok, false);
  const unnamed = validateAiExtension({ role: "receptionist", name: " ", allowed });
  assert.equal(unnamed.ok, false);
});

test("live calls stay off even after an AI extension is named", () => {
  const ready = aiConnectionStatus({ included: true, named: true, extensionNumber: "510", onPhoneSystem: true });
  assert.equal(ready.configured, "Configured");
  assert.match(ready.phone, /510/);
  assert.match(ready.live, /Off/);
  const closed = aiConnectionStatus({ included: false, named: false, extensionNumber: "", onPhoneSystem: false });
  assert.equal(closed.configured, "Not on this plan");
});
