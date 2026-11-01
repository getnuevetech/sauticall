import assert from "node:assert/strict";
import test from "node:test";
import { defaultInbound, extensionReady, inboundRuleBody, nationalTestNumber, signupPersonName, trunkNameFromAccount, trunkTestReady, trunkWriteRequest } from "../lib/default-setup.ts";
import { outboundRuleBody } from "../lib/outbound-rule.ts";
import { trunkPassthroughBody } from "../lib/trunk-body.ts";

test("the first extension waits for payment and the required confirmation", () => {
  assert.equal(extensionReady({ paid: false, emailVerified: true, phoneVerified: true, emailRequired: true, smsRequired: true }), false);
  assert.equal(extensionReady({ paid: true, emailVerified: false, phoneVerified: true, emailRequired: true, smsRequired: true }), false);
  assert.equal(extensionReady({ paid: true, emailVerified: true, phoneVerified: false, emailRequired: true, smsRequired: false }), true);
  assert.equal(extensionReady({ paid: true, emailVerified: true, phoneVerified: true, emailRequired: true, smsRequired: true }), true);
  assert.deepEqual(signupPersonName("Alex Morgan"), { first: "Alex", last: "Morgan" });
  assert.equal(trunkNameFromAccount("577137_I0000002"), "577137_I0000002");
  assert.equal(trunkNameFromAccount("SautiCall 3345397005"), "");
});

test("an AI receptionist takes the trunk, and otherwise the ring group does", () => {
  const ai = defaultInbound({ ai: true, extension: "2010", ringGroup: "8000" });
  assert.equal(ai?.to, "Extension");
  assert.equal(ai?.number, "2010");
  const group = defaultInbound({ ai: false, extension: "2010", ringGroup: "8000" });
  assert.equal(group?.to, "RingGroup");
  assert.equal(group?.label, "ring group 8000");
  const rule = inboundRuleBody({ name: "577137_I0000002", did: "3345397005", trunkId: 18, to: "RingGroup", number: "8000" });
  assert.equal(rule.OfficeHoursDestination.To, "RingGroup");
  assert.equal(rule.OutOfOfficeHoursDestination.Number, "8000");
  const outbound = outboundRuleBody({ name: "577137_I0000002", trunkId: 18, callerId: "3345397005", from: "2010", to: "2014", priority: 2, groupId: 9 });
  assert.deepEqual(outbound.GroupIds, [9]);
  assert.deepEqual(outbound.DNRanges, [{ From: "2010", To: "2014" }]);
});

test("a trunk test stays closed until the trunk is registered and both routes exist", () => {
  assert.equal(trunkTestReady({ trunkId: 18, routes: true, registered: false, extensionOnPhoneSystem: true }), false);
  assert.equal(trunkTestReady({ trunkId: 18, routes: true, registered: true, extensionOnPhoneSystem: true }), true);
  assert.equal(nationalTestNumber("+1 (334) 539-7005"), "3345397005");
  assert.equal(nationalTestNumber("510"), "");
});

test("the trunk request keeps the JSON body and removes the password and token", () => {
  const posted = trunkPassthroughBody({
    seed: {
      "@odata.type": "#Pbx.Trunk",
      Number: "10000",
      DidNumbers: { "@odata.type": "#Collection(String)", delta: null },
      Gateway: { "@odata.type": "#Pbx.Gateway", TemplateFilename: "voipms.pv.xml", Port: 5060 },
    },
    name: "577137_I0000002",
    number: "3345397005",
    authId: "577137_I0000002",
    password: "sip-secret",
    host: "houston1.voip.ms",
    template: "voipms.pv.xml",
  });
  const request = trunkWriteRequest({ origin: "https://pbx.example.com/", body: posted });
  assert.equal(request.method, "POST");
  assert.equal(request.endpoint, "https://pbx.example.com/xapi/v1/Trunks");
  assert.equal(request.headers.Authorization, "Bearer [hidden]");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.equal(request.body.Name, "577137_I0000002");
  assert.equal(request.body.AuthID, "577137_I0000002");
  assert.deepEqual(request.body.AuthPassword, { Value: "[hidden]" });
  assert.equal(JSON.stringify(request).includes("sip-secret"), false);
  assert.equal((request.body.Gateway as { Host: string }).Host, "houston1.voip.ms");
});
