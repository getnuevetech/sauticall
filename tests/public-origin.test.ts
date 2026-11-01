import assert from "node:assert/strict";
import test from "node:test";
import { inboundMailEndpoint, publicSiteOrigin, requestSiteOrigin } from "../lib/public-origin.ts";
import { trunkConnectionClass } from "../lib/trunk-body.ts";

test("stripe and mail links use the domain when the saved origin is an IP", () => {
  assert.equal(publicSiteOrigin("https://44.197.185.199"), "https://sauticall.com");
  assert.equal(requestSiteOrigin({ configured: "https://44.197.185.199", host: "44.197.185.199", proto: "https" }), "https://sauticall.com");
  assert.equal(requestSiteOrigin({ configured: "https://44.197.185.199", host: "127.0.0.1:3000", proto: "http" }), "http://127.0.0.1:3000");
  assert.equal(inboundMailEndpoint("https://44.197.185.199"), "https://sauticall.com/api/tickets/inbound");
});

test("a missing 3CX connection is not reported as a live validation error", () => {
  assert.equal(trunkConnectionClass("3CX connection is turned off."), "blocked_connection_disabled");
  assert.equal(trunkConnectionClass("3CX credentials are not configured."), "blocked_missing_credentials");
  assert.equal(trunkConnectionClass("3CX rejected the credentials."), "authentication_failed");
  assert.equal(trunkConnectionClass("3CX returned 400: The input was not valid."), "provider_validation_failed");
});
