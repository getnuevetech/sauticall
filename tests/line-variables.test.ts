import assert from "node:assert/strict";
import test from "node:test";
import { customerCanEdit, nextBillingDate, resolveVariable } from "../lib/line-variables.ts";

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
