import assert from "node:assert/strict";
import test from "node:test";
import { matchOrderPop, readPopServers, redactSecret, voipFailureText } from "../lib/provider-error.ts";

test("a VoIP.ms error keeps the status and the message field", () => {
  assert.equal(voipFailureText("invalid_pop", { status: "invalid_pop", message: "POP not found" }), "invalid_pop: POP not found");
  assert.equal(voipFailureText("invalid_routing", { status: "invalid_routing" }), "invalid_routing");
  assert.equal(voipFailureText("success", { status: "success", message: "success" }), "success");
});

test("secrets are not left in a failure detail", () => {
  const text = redactSecret("order failed api_password=secret123 bearer abc.def client_secret=hide-me");
  assert.equal(text.includes("secret123"), false);
  assert.equal(text.includes("hide-me"), false);
  assert.match(text, /api_password=redacted/);
  assert.match(text, /bearer redacted/);
});

test("a named POP matches the VoIP.ms server id", () => {
  const servers = readPopServers({
    servers: [{ server_pop: "5", server_hostname: "houston.voip.ms", server_name: "Houston", server_shortname: "Houston" }],
  });
  assert.equal(matchOrderPop("5", servers), "5");
  assert.equal(matchOrderPop("houston.voip.ms", servers), "5");
  assert.equal(matchOrderPop("Houston", servers), "5");
  assert.equal(matchOrderPop("miami", servers), "miami");
});
