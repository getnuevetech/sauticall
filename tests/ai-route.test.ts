import assert from "node:assert/strict";
import test from "node:test";
import { customerRouteVerdict, savedTrunkScope, selectSavedTrunk, type CustomerRouteInput } from "../lib/ai-route.ts";
import { dialBlockers, practiceAllowed, ROUTE_BLOCK } from "../lib/ai-notify.ts";

const ready: CustomerRouteInput = {
  extension: { number: "510", xapiId: 88, status: "created" },
  spanFrom: "510",
  spanTo: "510",
  trunk: { did: "3345397005", trunkId: 12, status: "trunk_live" },
  presentedCallerId: "+13345397005",
  scope: "scoped",
  client: {
    account: "577137_sc0002",
    username: "577137_sc0002",
    sipHost: "houston1.voip.ms",
    clientId: "44110",
    resellerClient: "44110",
  },
  resellerLogin: "577137",
};

test("a ready customer route uses that customer's extension and trunk and does not dial", () => {
  const verdict = customerRouteVerdict(ready);
  assert.equal(verdict.primary, "ready");
  assert.equal(verdict.path, "customer_3cx");
  assert.equal(verdict.backup, "customer_account");
  assert.equal(verdict.idle, true);
  assert.equal(verdict.placeCall, false);
  assert.equal(verdict.callerId, "+13345397005");
  assert.equal(verdict.lines.some((line) => line.text.includes("577137_sc0002") && line.text.includes("houston1.voip.ms")), true);
  assert.equal("password" in verdict, false);
  assert.equal(JSON.stringify(verdict).includes("secret"), false);
});

test("caller ID has to be the customer's own number", () => {
  const verdict = customerRouteVerdict({ ...ready, presentedCallerId: "7135550199" });
  assert.equal(verdict.primary, "blocked");
  assert.equal(verdict.path, "none");
  assert.equal(verdict.placeCall, false);
  assert.equal(verdict.lines.find((line) => line.name === "caller_id")?.text.includes("not this customer's number"), true);
});

test("an unconfirmed 3CX result keeps the VoIP.ms backup closed", () => {
  for (const scope of ["unknown", "timeout"] as const) {
    const verdict = customerRouteVerdict({ ...ready, scope });
    assert.equal(verdict.primary, "unknown");
    assert.equal(verdict.backup, "withheld");
    assert.equal(verdict.path, "none");
    assert.equal(verdict.placeCall, false);
    assert.equal(verdict.lines.find((line) => line.name === "backup")?.text.includes("stays closed"), true);
  }
});

test("a backup can be recorded only on the customer's client account", () => {
  const master = customerRouteVerdict({
    ...ready,
    client: { ...ready.client!, account: "577137", username: "577137", resellerClient: "44110" },
  });
  assert.equal(master.backup, "rejected");
  assert.equal(master.path, "customer_3cx");
  assert.equal(master.placeCall, false);
  assert.equal(master.lines.find((line) => line.name === "backup")?.text.includes("reseller login"), true);

  const loose = customerRouteVerdict({ ...ready, client: { ...ready.client!, resellerClient: "" } });
  assert.equal(loose.backup, "rejected");
  assert.equal(loose.lines.find((line) => line.name === "backup")?.text.includes("not attached"), true);

  const missing = customerRouteVerdict({ ...ready, client: null });
  assert.equal(missing.backup, "rejected");
  assert.equal(missing.placeCall, false);
});

test("an open rule or a missing customer extension cannot be the outbound path", () => {
  const open = customerRouteVerdict({ ...ready, scope: "open" });
  assert.equal(open.primary, "blocked");
  assert.equal(open.path, "none");
  assert.equal(open.placeCall, false);
  const outside = customerRouteVerdict({ ...ready, extension: { number: "200", xapiId: 3, status: "created" } });
  assert.equal(outside.primary, "blocked");
  assert.equal(outside.lines.find((line) => line.name === "extension")?.text.includes("outside"), true);
  const waiting = customerRouteVerdict({ ...ready, extension: { number: "510", xapiId: 0, status: "waiting" } });
  assert.equal(waiting.primary, "blocked");
});

test("only a live saved trunk counts as scoped", () => {
  assert.equal(savedTrunkScope({ trunkId: 12, status: "trunk_live" }), "scoped");
  assert.equal(savedTrunkScope({ trunkId: 12, status: "trunk_waiting" }), "unknown");
  assert.equal(savedTrunkScope({ trunkId: 0, status: "trunk_done" }), "unknown");
  assert.equal(savedTrunkScope({ trunkId: 0, status: "ordered" }), "absent");
  assert.equal(savedTrunkScope(null), "absent");
  const mixed = selectSavedTrunk(
    [{ did: "2025550199", trunkId: 0, status: "ordered" }, { did: "2025550101", trunkId: 0, status: "trunk_waiting" }],
    "",
  );
  assert.equal(mixed.scope, "unknown");
  const live = selectSavedTrunk(
    [{ did: "2025550103", trunkId: 44, status: "trunk_live" }, { did: "2025550199", trunkId: 0, status: "trunk_waiting" }],
    "2025550103",
  );
  assert.equal(live.scope, "scoped");
  assert.equal(live.trunk?.trunkId, 44);
  const absent = customerRouteVerdict({ ...ready, trunk: null, scope: "absent", presentedCallerId: "3345397005" });
  assert.equal(absent.primary, "blocked");
  assert.equal(absent.backup, "customer_account");
  assert.equal(absent.placeCall, false);
});

test("notification practice still cannot place a call", () => {
  const reasons = dialBlockers({
    serviceOn: true,
    clipReady: true,
    businessName: "Texas Labz",
    callerId: "3345397005",
    consent: "They asked for a reminder on the website.",
    number: "7135550142",
    suppressed: false,
    purposeEnabled: true,
    promotional: false,
    promoAllowed: false,
    hoursOpen: true,
  });
  assert.equal(reasons.at(-1), ROUTE_BLOCK);
  assert.equal(practiceAllowed(reasons), true);
});
