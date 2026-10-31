import assert from "node:assert/strict";
import test from "node:test";
import { customerTrunkStatus, trunkAttemptLabel, trunkMayAutoTry, trunkSubjectMatchesLine } from "../lib/trunk-tries.ts";
import { inboundRuleFound, outboundRuleFound, portIsComplete, portNumbers } from "../lib/trunk-routes.ts";

test("a trunk stops after three automatic tries and keeps an admin path", () => {
  assert.equal(trunkMayAutoTry(2), true);
  assert.equal(trunkMayAutoTry(3), false);
  assert.equal(trunkAttemptLabel({ status: "trunk_waiting", attempts: 3, trunkId: 0 }), "3 of 3 · waiting for admin");
  assert.equal(trunkAttemptLabel({ status: "trunk_waiting", attempts: 3, trunkId: 18 }), "Trunk 18 saved");
  assert.equal(customerTrunkStatus({ status: "trunk_waiting", attempts: 3 }), "The trunk could not be added after 3 tries. Waiting for the team.");
  assert.equal(customerTrunkStatus({ status: "trunk_waiting", trunkId: 18, routes: true }), "Trunk added. Connecting this number for calls.");
  assert.equal(trunkSubjectMatchesLine("DEMO-TRK-1042", "3345397005"), false);
  assert.equal(trunkSubjectMatchesLine("3345397005", "3345397005"), true);
});

test("a finished transfer lists its numbers and a complete carrier status", () => {
  assert.deepEqual(portNumbers("334-539-7005, 2176050015"), ["3345397005", "2176050015"]);
  assert.equal(portIsComplete({ status: "success", port: { port_status: "completed" } }), true);
  assert.equal(portIsComplete({ status: "success", port: { port_status: "pending" } }), false);
});

test("a 3CX route check matches this trunk and the department range", () => {
  const inbound = { value: [{ TrunkId: 18, DID: "3345397005" }, { TrunkId: 4, DID: "2176050015" }] };
  const outbound = { value: [{ Routes: [{ TrunkId: 18 }], DNRanges: [{ From: "510", To: "519" }] }] };
  assert.equal(inboundRuleFound(inbound, 18, "3345397005"), true);
  assert.equal(inboundRuleFound(inbound, 18, "2176050015"), false);
  assert.equal(outboundRuleFound(outbound, 18, "510", "519"), true);
  assert.equal(outboundRuleFound(outbound, 18, "520", "529"), false);
});
