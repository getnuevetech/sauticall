import assert from "node:assert/strict";
import test from "node:test";
import { smsAccountNote, smsDestination } from "../lib/sms-number.ts";

test("a text message uses a 10-digit US or Canadian number", () => {
  assert.equal(smsDestination("+1 (202) 555-0100"), "2025550100");
  assert.equal(smsDestination("12025550100"), "2025550100");
  assert.equal(smsDestination("2025550100"), "2025550100");
  assert.equal(smsDestination("+44 7700 900123"), "");
  assert.equal(smsDestination("555"), "");
});

test("a connection check says whether the text-message number is on the account", () => {
  assert.equal(smsAccountNote(null), "");
  assert.equal(smsAccountNote({ ok: true, owned: true }), " The text-message number is on this account.");
  assert.equal(smsAccountNote({ ok: true, owned: false }), " The text-message number is not on this account.");
  assert.equal(smsAccountNote({ ok: false, owned: false }), " The text-message number could not be checked.");
});
