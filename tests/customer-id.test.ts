import assert from "node:assert/strict";
import test from "node:test";
import { clientMailbox, formatCustomerCode, kindFromPlan, nextCustomerCode } from "../lib/customer-code.ts";
import { parseGoogleAddress } from "../lib/google-address.ts";
import { addressReady } from "../lib/e911-address.ts";
import { bestTrunk, outboundChoice, trunkOutcome } from "../lib/outbound-path.ts";

test("customer IDs use I- and B- with seven digits", () => {
  assert.equal(kindFromPlan({ seats: 1 }), "individual");
  assert.equal(kindFromPlan(null), "individual");
  assert.equal(kindFromPlan({ seats: 5 }), "business");
  assert.equal(kindFromPlan({ seats: 0, custom: true }), "business");
  assert.equal(nextCustomerCode("individual", []), "I-0000001");
  assert.equal(nextCustomerCode("individual", ["I-0000001", "B-0000004"]), "I-0000002");
  assert.equal(nextCustomerCode("business", ["I-0000009"]), "B-0000001");
  assert.equal(formatCustomerCode("business", 12), "B-0000012");
  assert.equal(clientMailbox("I-0000001"), "I-0000001@sauticall.com");
  assert.equal(clientMailbox("I-0000001").includes("example.com"), false);
  assert.equal(clientMailbox("customer-1"), "");
});

test("a Google address fills every street field", () => {
  const parsed = parseGoogleAddress([
    { longText: "15211", shortText: "15211", types: ["street_number"] },
    { longText: "Park Row", shortText: "Park Row", types: ["route"] },
    { longText: "Suite 4", shortText: "Suite 4", types: ["subpremise"] },
    { longText: "Houston", shortText: "Houston", types: ["locality"] },
    { longText: "Texas", shortText: "TX", types: ["administrative_area_level_1"] },
    { longText: "United States", shortText: "US", types: ["country"] },
    { longText: "77084", shortText: "77084", types: ["postal_code"] },
  ]);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.address.street_number, "15211");
    assert.equal(parsed.address.street_name, "Park Row");
    assert.equal(parsed.address.address_type, "STE");
    assert.equal(parsed.address.address_number, "4");
    assert.equal(parsed.address.city, "Houston");
    assert.equal(parsed.address.state, "TX");
    assert.equal(parsed.address.zip, "77084");
    assert.equal(addressReady(parsed.address), true);
  }
  assert.equal(parseGoogleAddress([{ shortText: "GB", types: ["country"] }]).ok, false);
  assert.equal(addressReady(null), false);
});

test("VoIP.ms backup opens only after a confirmed trunk failure and an admin switch", () => {
  assert.equal(trunkOutcome("trunk_live", 44), "ready");
  assert.equal(trunkOutcome("trunk_waiting", 44), "unknown");
  assert.equal(trunkOutcome("trunk_waiting", 0), "failed");
  assert.equal(trunkOutcome("trunk_done", 44), "unknown");
  assert.equal(trunkOutcome("ordered", 0), "absent");
  assert.equal(bestTrunk([{ status: "trunk_waiting", trunkId: 0 }, { status: "trunk_live", trunkId: 44 }]), "ready");
  const ready = outboundChoice({ trunk: "ready", backupEnabled: true, customerClient: true });
  assert.equal(ready.path, "3cx");
  assert.equal(ready.placeCall, false);
  const unknown = outboundChoice({ trunk: "unknown", backupEnabled: true, customerClient: true });
  assert.equal(unknown.path, "none");
  const off = outboundChoice({ trunk: "failed", backupEnabled: false, customerClient: true });
  assert.equal(off.path, "none");
  assert.match(off.reason, /administrator/);
  const on = outboundChoice({ trunk: "failed", backupEnabled: true, customerClient: true });
  assert.equal(on.path, "voipms");
  assert.equal(on.placeCall, false);
  const missing = outboundChoice({ trunk: "failed", backupEnabled: true, customerClient: false });
  assert.equal(missing.path, "none");
});
