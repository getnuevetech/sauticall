import assert from "node:assert/strict";
import test from "node:test";
import { bundlePayLabel } from "../lib/account-display.ts";
import { flagGroups } from "../lib/admin-controls.ts";
import { extensionCustomerMessage, extensionEmailConflict } from "../lib/customer-message.ts";
import { carrierDidRef, customerNumberStatus, orderRecord, orderTimedOut } from "../lib/number-order.ts";
import { defaultFlags } from "../lib/seed-data.ts";

test("a slow order that was sent still counts as bought", () => {
  const pending = orderRecord({ ok: false, pending: true }, "361-226-7988");
  assert.equal(pending.status, "ordered");
  assert.equal(pending.providerRef, carrierDidRef("3612267988"));
  assert.equal(customerNumberStatus(pending.status, pending.providerRef, "3612267988"), "Bought");
  const failed = orderRecord({ ok: false }, "3612267988");
  assert.equal(failed.status, "exception");
  assert.equal(failed.providerRef, "");
  assert.equal(orderTimedOut("VoIP.ms did not answer within 20 seconds."), true);
  assert.equal(orderTimedOut("invalid_did"), false);
});

test("email and mobile confirmation can be turned off without treating the customer as confirmed", () => {
  const email = defaultFlags.find((flag) => flag.key === "auth.verify_email");
  const sms = defaultFlags.find((flag) => flag.key === "auth.verify_sms");
  assert.equal(email?.enabled, true);
  assert.equal(sms?.enabled, true);
  const access = flagGroups(defaultFlags).find((group) => group.id === "access");
  assert.ok(access?.rows.some((flag) => flag.key === "auth.verify_email"));
  assert.ok(access?.rows.some((flag) => flag.key === "auth.verify_sms"));
});

test("a minute bundle button does not name Stripe", () => {
  assert.equal(bundlePayLabel("$25", "Card via Stripe"), "Pay $25 with Card");
  assert.equal(bundlePayLabel("$25", "PayPal"), "Pay $25 with PayPal");
  assert.equal(bundlePayLabel("$10", "Stripe").includes("Stripe"), false);
});

test("a duplicate extension email is explained without naming the phone system", () => {
  const raw = "3CX returned 400 (duplicate): EmailAddress already exists for someone else.";
  assert.equal(extensionEmailConflict(raw), true);
  const message = extensionCustomerMessage(raw);
  assert.equal(message, "That email is already used for an extension. Use a different email.");
  assert.equal(/3cx|voip/i.test(message), false);
  const other = extensionCustomerMessage("3CX answered 403.");
  assert.equal(other.includes("3CX"), false);
  assert.match(other, /could not be added/);
});
