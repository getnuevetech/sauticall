import assert from "node:assert/strict";
import test from "node:test";
import { trunkDialedNumber, trunkPassthroughBody, trunkProvisionVerdict, trunkTemplateName, readTrunkIdentity, redactProvisioning } from "../lib/trunk-body.ts";
import { xapiWriteHeaders } from "../lib/xapi-headers.ts";

test("a trunk write uses the JSON headers 3CX needs to bind the body", () => {
  const headers = xapiWriteHeaders({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.Accept, "application/json");
  assert.equal(headers["OData-Version"], "4.0");
  assert.equal(headers.Prefer, "return=representation");
});

test("the VoIP.ms template is initialized and empty deltas are arrays", () => {
  assert.equal(trunkTemplateName(""), "voipms.pv.xml");
  assert.equal(trunkTemplateName("GenericSIPTrunk.pv.xml"), "voipms.pv.xml");
  assert.equal(trunkTemplateName("custom.pv.xml"), "custom.pv.xml");
  assert.equal(trunkDialedNumber("2176050015"), "2176050015");
  assert.equal(trunkDialedNumber("12176050015"), "2176050015");
  const posted = trunkPassthroughBody({
    seed: {
      "@odata.type": "#Pbx.Trunk",
      Number: "10000",
      DidNumbers: { "@odata.type": "#Collection(String)", delta: null },
      Gateway: {
        "@odata.type": "#Pbx.Gateway",
        TemplateFilename: "voipms.pv.xml",
        InboundParams: { "@odata.type": "#Collection(Pbx.GatewayParameterBinding)", value: [{ Name: "Contact" }], delta: null },
        OutboundParams: { "@odata.type": "#Collection(Pbx.GatewayParameterBinding)", delta: [{ Name: "From" }] },
      },
    },
    name: "SautiCall 2176050015",
    number: "2176050015",
    authId: "577137_I0000001",
    password: "sip-secret",
    host: "houston1.voip.ms",
    template: "voipms.pv.xml",
  });
  assert.equal((posted.Gateway as { TemplateFilename: string; Host: string }).TemplateFilename, "voipms.pv.xml");
  assert.equal((posted.Gateway as { Host: string }).Host, "houston1.voip.ms");
  assert.deepEqual(posted.DidNumbers, { "@odata.type": "#Collection(String)", delta: ["2176050015"] });
  const gateway = posted.Gateway as { InboundParams: { delta: { Name: string }[] }; OutboundParams: { delta: { Name: string }[] } };
  assert.equal(gateway.InboundParams.delta[0].Name, "Contact");
  assert.equal(gateway.OutboundParams.delta[0].Name, "From");
  assert.equal(JSON.stringify(posted).includes("sip-secret"), true);
  assert.equal(redactProvisioning(`password sip-secret token Bearer abc.def`, ["sip-secret"]).includes("sip-secret"), false);
  assert.match(redactProvisioning("Authorization Bearer abc.def-ghi", []), /Bearer \[hidden\]/);
});

test("provisioning stays incomplete until registration, both routes, and confirmed test calls", () => {
  const waiting = trunkProvisionVerdict({ registered: false, inbound: true, outbound: true, callsConfirmed: false });
  assert.equal(waiting.complete, false);
  assert.match(waiting.reason, /not registered/);
  const uncalled = trunkProvisionVerdict({ registered: true, inbound: true, outbound: true, callsConfirmed: false });
  assert.equal(uncalled.status, "trunk_waiting");
  assert.match(uncalled.reason, /No call was placed/);
  const done = trunkProvisionVerdict({ registered: true, inbound: true, outbound: true, callsConfirmed: true });
  assert.equal(done.status, "trunk_live");
  const identity = readTrunkIdentity({ Id: 44, Number: "10012", IsOnline: false });
  assert.equal(identity.id, 44);
  assert.equal(identity.number, "10012");
  assert.equal(identity.registered, false);
});
