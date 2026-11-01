import assert from "node:assert/strict";
import test from "node:test";
import { inboundMailEndpoint, publicSiteOrigin, requestSiteOrigin } from "../lib/public-origin.ts";

test("an IP public origin becomes the site domain", () => {
  assert.equal(publicSiteOrigin("https://44.197.185.199"), "https://sauticall.com");
  assert.equal(publicSiteOrigin("https://44.197.185.199/"), "https://sauticall.com");
  assert.equal(inboundMailEndpoint("https://44.197.185.199"), "https://sauticall.com/api/tickets/inbound");
  assert.equal(inboundMailEndpoint(""), "https://sauticall.com/api/tickets/inbound");
  assert.equal(inboundMailEndpoint("https://your-site"), "https://sauticall.com/api/tickets/inbound");
});

test("a real hostname is kept and local requests stay local", () => {
  assert.equal(publicSiteOrigin("https://sauticall.com"), "https://sauticall.com");
  assert.equal(publicSiteOrigin("https://staging.sauticall.com"), "https://staging.sauticall.com");
  assert.equal(requestSiteOrigin({ configured: "https://44.197.185.199", host: "44.197.185.199", proto: "https" }), "https://sauticall.com");
  assert.equal(requestSiteOrigin({ configured: "https://44.197.185.199", host: "127.0.0.1:3000", proto: "http" }), "http://127.0.0.1:3000");
  assert.equal(requestSiteOrigin({ host: "localhost:3000", proto: "http" }), "http://localhost:3000");
  assert.equal(requestSiteOrigin({ host: "sauticall.com", proto: "https" }), "https://sauticall.com");
});
