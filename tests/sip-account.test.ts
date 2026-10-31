import assert from "node:assert/strict";
import test from "node:test";
import { callerIdDigits, sipUsernameCandidates, TRUNK_SIP_DEFAULTS } from "../lib/sip-account.ts";
import { choosePlanPackage } from "../lib/reseller-package.ts";

test("a SIP username uses the customer ID and stays within 12 characters", () => {
  assert.deepEqual(sipUsernameCandidates("I-0000020"), ["I-0000020", "I0000020"]);
  assert.deepEqual(sipUsernameCandidates("B-0000007"), ["B-0000007", "B0000007"]);
  assert.deepEqual(sipUsernameCandidates("I-000000123456"), ["I-0000001234", "I00000012345"]);
  assert.equal(callerIdDigits("3345397005"), "3345397005");
  assert.equal(callerIdDigits("13345397005"), "3345397005");
  assert.equal(callerIdDigits(""), "");
});

test("a new trunk uses SIP password login and the portal defaults", () => {
  assert.equal(TRUNK_SIP_DEFAULTS.protocol, "1");
  assert.equal(TRUNK_SIP_DEFAULTS.device_type, "1");
  assert.equal(TRUNK_SIP_DEFAULTS.lock_international, "1");
  assert.equal(TRUNK_SIP_DEFAULTS.canada_routing, "2");
  assert.equal(TRUNK_SIP_DEFAULTS.allowed_codecs, "ulaw;g729");
  assert.equal(TRUNK_SIP_DEFAULTS.nat, "yes");
  assert.equal(TRUNK_SIP_DEFAULTS.sip_traffic, "0");
});

test("the paid plan picks its package, and a missing package uses Default", () => {
  const catalog = {
    packages: [
      { package: "10", name: "Default", monthly_fee: "0", setup_fee: "0" },
      { package: "20", name: "Small Business", monthly_fee: "10.00", setup_fee: "0" },
      { package: "30", name: "Team", monthly_fee: "15.00", setup_fee: "0" },
    ],
  };
  assert.equal(choosePlanPackage("Small Business", catalog), "20");
  assert.equal(choosePlanPackage("Solo", catalog), "10");
  assert.equal(choosePlanPackage("", { packages: [{ package: "40", name: "Starter", monthly_fee: "3", setup_fee: "0" }, { package: "50", name: "Free", monthly_fee: "0", setup_fee: "0" }] }), "50");
});
