import assert from "node:assert/strict";
import test from "node:test";
import { acceptsTestCode, challengeOpen, codesMatch, hashCode, normalizeMobile } from "../lib/verify-code.ts";
import { defaultFlags } from "../lib/seed-data.ts";

test("123456 is accepted only while the temporary test code is on", () => {
  assert.equal(acceptsTestCode("123456", true), true);
  assert.equal(acceptsTestCode("123 456", true), true);
  assert.equal(acceptsTestCode("123456", false), false);
  assert.equal(acceptsTestCode("654321", true), false);
  const flag = defaultFlags.find((item) => item.key === "auth.test_code");
  assert.equal(flag?.label, "Temporary test code");
  assert.equal(flag?.enabled, false);
});

test("a mobile number is stored with a country code", () => {
  assert.equal(normalizeMobile("(202) 555-0100"), "+12025550100");
  assert.equal(normalizeMobile("12025550100"), "+12025550100");
  assert.equal(normalizeMobile("+44 7700 900123"), "+447700900123");
  assert.equal(normalizeMobile("555"), "");
});

test("a code matches only the hash it was saved with", () => {
  const hash = hashCode("123456", "salt");
  assert.equal(codesMatch("123456", "salt", hash), true);
  assert.equal(codesMatch("123457", "salt", hash), false);
  assert.equal(codesMatch("123456", "other", hash), false);
});

test("a challenge closes after it is used, expires, or is tried too many times", () => {
  const later = "2099-01-01T00:00:00.000Z";
  assert.equal(challengeOpen({ expiresAt: later, usedAt: "", attempts: 0 }, Date.parse("2026-01-01T00:00:00.000Z")), true);
  assert.equal(challengeOpen({ expiresAt: later, usedAt: "2026-01-01T00:00:00.000Z", attempts: 0 }), false);
  assert.equal(challengeOpen({ expiresAt: "2020-01-01T00:00:00.000Z", usedAt: "", attempts: 0 }), false);
  assert.equal(challengeOpen({ expiresAt: later, usedAt: "", attempts: 5 }), false);
});
