import assert from "node:assert/strict";
import test from "node:test";
import { customerCanEdit, lineOverride, nextBillingDate, resolveVariable, variableUpdates, variableValueLabel } from "../lib/line-variables.ts";

test("the team value wins when both sides can set a variable", () => {
  const shared = { adminValue: "30", audience: "both" as const };
  assert.equal(resolveVariable(shared, "14"), "30");
  assert.equal(resolveVariable({ adminValue: "", audience: "both" }, "14"), "14");
  assert.equal(resolveVariable({ adminValue: "30", audience: "admin" }, "14"), "30");
  assert.equal(resolveVariable({ adminValue: "30", audience: "customer" }, "14"), "14");
  assert.equal(customerCanEdit(shared), false);
  assert.equal(customerCanEdit({ adminValue: "", audience: "both" }), true);
  assert.equal(customerCanEdit({ adminValue: "30", audience: "customer" }), true);
});

test("the next bill is the payment day plus the saved number of days, and never in the past", () => {
  assert.equal(nextBillingDate("2026-10-27T15:00:00.000Z", "30", "2026-10-27"), "2026-11-26");
  assert.equal(nextBillingDate("2026-01-01T18:00:00.000Z", "30", "2026-10-27"), "2026-10-28");
  assert.equal(nextBillingDate("", "30", "2026-10-27"), "2026-11-26");
  assert.equal(nextBillingDate("2020-01-01T12:00:00.000Z", "nope", "2026-10-27") > "2026-10-27", true);
});

test("a blank override keeps the connection default, and zero or Off replaces it", () => {
  assert.equal(lineOverride("1", "0"), "0");
  assert.equal(lineOverride("1", ""), "1");
  assert.equal(lineOverride("1", "  "), "1");
  assert.equal(lineOverride("ulaw", "gsm"), "gsm");
});

test("not set, off, and zero stay distinct in the variable list", () => {
  assert.equal(variableValueLabel({ key: "lock_international", kind: "text", adminValue: "" }), "Not set");
  assert.equal(variableValueLabel({ key: "lock_international", kind: "text", adminValue: "0" }), "Off");
  assert.equal(variableValueLabel({ key: "lock_international", kind: "text", adminValue: "1" }), "On");
  assert.equal(variableValueLabel({ key: "billing_days", kind: "days", adminValue: "" }), "Not set");
  assert.equal(variableValueLabel({ key: "billing_days", kind: "days", adminValue: "0" }), "0 days");
  assert.equal(variableValueLabel({ key: "nat", kind: "text", adminValue: "" }), "Not set");
});

test("saving one variable does not include the others", () => {
  const current = [
    { key: "billing_days", adminValue: "30", audience: "both" },
    { key: "lock_international", adminValue: "", audience: "admin" },
    { key: "nat", adminValue: "yes", audience: "admin" },
  ];
  const rows = variableUpdates(current, { value_lock_international: "0", audience_lock_international: "admin" });
  assert.deepEqual(rows, [{ key: "lock_international", adminValue: "0", audience: "admin" }]);
  assert.deepEqual(variableUpdates(current, {}), []);
});
