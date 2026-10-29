import assert from "node:assert/strict";
import test from "node:test";
import { firstListedId } from "../lib/pbx-id.ts";
import { companyMatches, formatDid, lineStatusLabel, maskCredential, setupLabel, setupStatus, trunkStep } from "../lib/phone-ops-view.ts";

test("company actions only match the selected company", () => {
  assert.equal(companyMatches(4, 4), true);
  assert.equal(companyMatches(4, 5), false);
  assert.equal(companyMatches(0, 0), false);
});

test("credentials stay masked until a permitted reveal", () => {
  assert.equal(maskCredential("577137_sc0002"), "••••02");
  assert.equal(maskCredential(""), "");
  assert.equal(maskCredential("ab"), "••••");
});

test("setup status separates saved records from provisioning", () => {
  assert.equal(setupStatus({ records: 3, failed: 1, waiting: 0, live: 2 }), "attention");
  assert.equal(setupLabel("provisioned"), "Provisioned");
  assert.equal(setupStatus({ records: 2, failed: 0, waiting: 0, live: 2 }), "provisioned");
  assert.equal(trunkStep({ hasAccount: true, trunkId: 0, status: "trunk_waiting" }).trunk, "Failed");
  assert.equal(trunkStep({ hasAccount: true, trunkId: 9, status: "trunk_done" }).routing, "Not verified");
  assert.equal(lineStatusLabel("trunk_done"), "Recorded manually");
});

test("phone numbers and existing phone-system ids are read without assuming one trunk", () => {
  assert.equal(formatDid("2025550101"), "+1 (202) 555-0101");
  assert.equal(firstListedId({ value: [{ Id: 12 }, { Id: 13 }] }), 12);
  assert.equal(firstListedId({ Id: 7 }), 7);
});
