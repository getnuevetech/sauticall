import assert from "node:assert/strict";
import test from "node:test";
import { applyLineTemplate, callerIdDigits, lineTemplateDrift, sipUsernameCandidates, TRUNK_SIP_DEFAULTS } from "../lib/sip-account.ts";
import { choosePlanPackage } from "../lib/reseller-package.ts";

test("a SIP username uses the customer ID and stays within 12 characters", () => {
  assert.deepEqual(sipUsernameCandidates("I0000020"), ["I0000020"]);
  assert.deepEqual(sipUsernameCandidates("B0000007"), ["B0000007"]);
  assert.deepEqual(sipUsernameCandidates("I-0000020"), ["I0000020"]);
  assert.equal(callerIdDigits("3345397005"), "3345397005");
  assert.equal(callerIdDigits("13345397005"), "3345397005");
  assert.equal(callerIdDigits(""), "");
});

test("a new line account uses an ATA device, IP phone, or softphone", () => {
  assert.equal(TRUNK_SIP_DEFAULTS.protocol, "1");
  assert.equal(TRUNK_SIP_DEFAULTS.device_type, "2");
  assert.equal(TRUNK_SIP_DEFAULTS.lock_international, "1");
  assert.equal(TRUNK_SIP_DEFAULTS.canada_routing, "2");
  assert.equal(TRUNK_SIP_DEFAULTS.allowed_codecs, "ulaw;g729");
  assert.equal(TRUNK_SIP_DEFAULTS.nat, "yes");
  assert.equal(TRUNK_SIP_DEFAULTS.sip_traffic, "0");
  assert.equal(TRUNK_SIP_DEFAULTS.music_on_hold, "none");
  assert.equal(TRUNK_SIP_DEFAULTS.record_calls, "0");
  assert.equal(TRUNK_SIP_DEFAULTS.allow225, "0");
  assert.equal(TRUNK_SIP_DEFAULTS.international_route, "1");
  const drifted = { device_type: "1", lock_international: "0", music_on_hold: "default", callerid_number: "" };
  assert.equal(lineTemplateDrift(drifted, "3345397005"), true);
  const fixed = applyLineTemplate(drifted, "3345397005");
  assert.equal(fixed.device_type, "2");
  assert.equal(fixed.lock_international, "1");
  assert.equal(fixed.canada_routing, "2");
  assert.equal(fixed.music_on_hold, "none");
  assert.equal(fixed.callerid_number, "3345397005");
  assert.equal(lineTemplateDrift(fixed, "3345397005"), false);
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
