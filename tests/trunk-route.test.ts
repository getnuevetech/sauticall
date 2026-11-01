import assert from "node:assert/strict";
import test from "node:test";
import { outboundRuleBody } from "../lib/outbound-rule.ts";
import { trunkAdminSummary, trunkProgress } from "../lib/phone-ops-view.ts";
import { inboundRuleAttempts, signupPersonName, trunkRoutePatch, trunkStatusNote } from "../lib/trunk-route.ts";
import { inboundRuleFound, outboundAssignedToDepartment, outboundRuleId, trunkDepartmentLimit } from "../lib/trunk-routes.ts";

test("a default person name comes from the account name", () => {
  assert.deepEqual(signupPersonName("IFe Esi", "tech@nuevetech.io"), { first: "IFe", last: "Esi" });
  assert.equal(signupPersonName("", "ada.lovelace@example.com").first, "ada");
});

test("the trunk default route uses the same destination for office hours and after hours", () => {
  const [primary] = inboundRuleAttempts({ name: "SautiCall 9708430420", did: "9708430420", trunkId: 159, to: "RingGroup", number: "800" });
  assert.equal(primary.RuleName, "SautiCall 9708430420");
  assert.equal(primary.Data, "9708430420");
  assert.equal(primary.TrunkDN.Id, 159);
  assert.equal(primary.OfficeHoursDestination.To, "RingGroup");
  assert.equal(primary.OutOfOfficeHoursDestination.Number, "800");
  assert.equal(primary.HolidaysDestination.To, "RingGroup");
  const patch = trunkRoutePatch({ did: "9708430420", to: "Extension", number: "545" });
  assert.equal(patch.RoutingRules.delta[0].OfficeHoursDestination.To, "Extension");
  assert.equal(patch.RoutingRules.delta[0].OutOfOfficeHoursDestination.Number, "545");
});

test("an outbound rule is limited to the department extension range and assigned to that department", () => {
  const rule = outboundRuleBody({ name: "SautiCall 9708430420", trunkId: 159, callerId: "9708430420", from: "545", to: "549", priority: 4, groupId: 12 });
  assert.deepEqual(rule.DNRanges, [{ From: "545", To: "549" }]);
  assert.deepEqual(rule.GroupIds, [12]);
  assert.equal(rule.Routes[0].TrunkId, 159);
});

test("a route check recognizes the trunk link and the department assignment", () => {
  const inbound = { value: [{ RuleName: "Main", Data: "9708430420", TrunkDN: { Id: 159 } }] };
  assert.equal(inboundRuleFound(inbound, 159, "19708430420"), true);
  const outbound = { value: [{ Routes: [{ TrunkId: 159 }], DNRanges: [{ From: "545", To: "549" }], GroupIds: [12] }] };
  assert.equal(outboundAssignedToDepartment(outbound, 159, "545", "549", 12), true);
  assert.equal(outboundRuleId(outbound, 159, "545", "549"), 0);
  assert.equal(outboundRuleId({ value: [{ Id: 44, Routes: [{ TrunkId: 159 }], DNRanges: [{ From: "545", To: "549" }], GroupIds: [12] }] }, 159, "545", "549"), 44);
  assert.equal(outboundAssignedToDepartment(outbound, 159, "545", "549", 13), false);
  assert.equal(trunkDepartmentLimit({ Groups: [{ GroupId: 12 }] }, 12), "yes");
  assert.equal(trunkDepartmentLimit({ Id: 159 }, 12), "unknown");
});

test("admin status names each missing trunk piece", () => {
  const progress = trunkProgress({
    hasAccount: true,
    departmentOnPbx: false,
    extensionOnPbx: false,
    routeLabel: "",
    routeOnPbx: false,
    trunkId: 159,
    status: "trunk_waiting",
    inboundOnPbx: false,
    outboundOnPbx: false,
    outboundAssigned: false,
    departmentLimited: false,
  });
  assert.equal(progress.trunk, "Saved");
  assert.equal(progress.department, "Not on 3CX");
  assert.equal(progress.route, "Not created");
  assert.match(trunkAdminSummary(progress), /department/);
  assert.match(trunkAdminSummary(progress), /outbound rule/);
  const ready = trunkProgress({
    hasAccount: true,
    departmentOnPbx: true,
    extensionOnPbx: true,
    routeLabel: "Ring group Main · 800",
    routeOnPbx: true,
    trunkId: 159,
    status: "trunk_waiting",
    inboundOnPbx: true,
    outboundOnPbx: true,
    outboundAssigned: true,
    departmentLimited: true,
  });
  assert.equal(ready.route, "Ring group Main · 800");
  assert.equal(ready.outbound, "On 3CX, assigned to the department");
  assert.match(trunkAdminSummary(ready), /records the test calls/);
  const note = trunkStatusNote({
    trunkId: 159,
    trunkNumber: "10004",
    departmentName: "IFe-Esi-Ola Ent.",
    departmentOnPbx: false,
    extension: "545",
    extensionOnPbx: false,
    routeLabel: "",
    routeOnPbx: false,
    inboundOnPbx: false,
    outboundOnPbx: false,
    outboundAssigned: false,
    departmentLimited: false,
    from: "545",
    to: "549",
    account: "577137_I0000003",
    host: "houston1.voip.ms",
    detail: "3CX returned 400: The input was not valid.",
  });
  assert.match(note, /Department IFe-Esi-Ola Ent. is not on 3CX/);
  assert.match(note, /Outbound rule for extensions 545–549 is not on 3CX/);
  assert.match(note, /not limited to this department/);
});
