import assert from "node:assert/strict";
import test from "node:test";
import { firstListedId } from "../lib/pbx-id.ts";
import { companyMatches, formatDid, lineStatusLabel, maskCredential, setupEmailState, setupLabel, setupStatus, trunkProgress, trunkRepairsOpen, trunkStep } from "../lib/phone-ops-view.ts";

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
  assert.equal(trunkStep({ hasAccount: true, trunkId: 9, status: "trunk_done" }).routing, "Certified");
  assert.equal(lineStatusLabel("trunk_done"), "Provisioned");
});

test("a failed setup email stays separate from extension provisioning", () => {
  const failed = setupEmailState("Extension 511 is on the phone system. The SautiCall setup email failed: The mail server took too long to accept the connection.");
  assert.equal(failed.label, "Delivery failed");
  assert.match(failed.cause, /took too long/);
  assert.equal(setupEmailState("Extension 510 is on the phone system. SautiCall sent the setup email.").label, "Sent");
  assert.equal(setupEmailState("Extension 510 is on the phone system.", "A setup email was sent to this address.").label, "Sent");
  assert.equal(setupEmailState("The SautiCall setup email failed: timeout", "A setup email was sent to this address.").label, "Delivery failed");
  assert.equal(setupEmailState("").label, "Not sent");
});

test("repair actions stay off while every trunk check is good", () => {
  const input = {
    hasAccount: true,
    departmentOnPbx: true,
    extensionOnPbx: true,
    routeLabel: "AI receptionist extension 529",
    routeOnPbx: true,
    trunkId: 159,
    status: "trunk_live",
    inboundOnPbx: true,
    outboundOnPbx: true,
    outboundAssigned: true,
    departmentLimited: true,
  };
  assert.equal(trunkRepairsOpen(trunkProgress(input)), false);
  assert.equal(trunkRepairsOpen(trunkProgress({ ...input, inboundOnPbx: false })), true);
  assert.equal(trunkRepairsOpen(trunkProgress({ ...input, status: "trunk_waiting" })), true);
});

test("phone numbers and existing phone-system ids are read without assuming one trunk", () => {
  assert.equal(formatDid("2025550101"), "+1 (202) 555-0101");
  assert.equal(firstListedId({ value: [{ Id: 12 }, { Id: 13 }] }), 12);
  assert.equal(firstListedId({ Id: 7 }), 7);
});
