import assert from "node:assert/strict";
import test from "node:test";
import { applyBundleEdits, bundleImpact, configuredCurrency, planChanges, planImpact, pricePerMinute } from "../lib/catalog.ts";
import { defaultPlans } from "../lib/seed-data.ts";

test("catalog currency stays on the configured code unless more than one is supported", () => {
  assert.deepEqual(configuredCurrency([]), { code: "USD", choices: [] });
  assert.deepEqual(configuredCurrency(["usd", "USD, "]), { code: "USD", choices: [] });
  assert.deepEqual(configuredCurrency(["USD", "CAD"]), { code: "USD", choices: ["USD", "CAD"] });
});

test("a plan edit explains subscribers without funding or provisioning", () => {
  const before = defaultPlans[1];
  const after = { ...before, features: [...before.features, "queues"], carrierCredit: 12 };
  const changes = planChanges(before, after);
  assert.equal(changes.find((change) => change.label === "Call queues")?.to, "On");
  const lines = planImpact({ before, after, subscribers: 2, fundEnabled: true });
  assert.match(lines.join(" "), /does not provision the phone system/);
  assert.match(lines.join(" "), /does not add or remove provider funds/);
  assert.match(lines.join(" "), /does not fund a provider account/);
  assert.equal(planImpact({ before: null, after, subscribers: 0, fundEnabled: false }).some((line) => /create phone service/.test(line)), true);
});

test("hiding a bundle keeps the record and purchased balances", () => {
  const existing = [
    { name: "500 minutes", minutes: 500, price: 40, enabled: true },
    { name: "100 minutes", minutes: 100, price: 10, enabled: true },
  ];
  const hidden = applyBundleEdits(existing, [{ ...existing[0], enabled: false }, existing[1]]);
  assert.equal(hidden.ok, true);
  if (hidden.ok) assert.equal(hidden.bundles[0].enabled, false);
  const dropped = applyBundleEdits(existing, [existing[1]]);
  assert.equal(dropped.ok, false);
  const lines = bundleImpact({ before: existing[0], after: { ...existing[0], enabled: false }, purchases: 3 });
  assert.match(lines.join(" "), /not deleted/);
  assert.match(lines.join(" "), /does not add or remove customer minute balances/);
  assert.equal(pricePerMinute(40, 500, "USD"), "$0.08 / min");
});
