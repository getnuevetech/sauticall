import assert from "node:assert/strict";
import test from "node:test";
import { authenticatorQr, authenticatorUri } from "../lib/authenticator.ts";

test("an authenticator link carries the account email and the setup key", () => {
  const uri = authenticatorUri("ag@kwiktech.net", "4WQEQ5PNGIJRL3SUA7THZ7ETSKFSPKX4");
  assert.equal(
    uri,
    "otpauth://totp/SautiCall:ag%40kwiktech.net?secret=4WQEQ5PNGIJRL3SUA7THZ7ETSKFSPKX4&issuer=SautiCall&algorithm=SHA1&digits=6&period=30",
  );
});

test("the authenticator code is a scannable image of that link", async () => {
  const uri = authenticatorUri("ag@kwiktech.net", "4WQEQ5PNGIJRL3SUA7THZ7ETSKFSPKX4");
  const svg = await authenticatorQr(uri);
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /<\/svg>$/);
  assert.doesNotMatch(svg, /otpauth/);
  assert.doesNotMatch(svg, /4WQEQ5PNGIJRL3SUA7THZ7ETSKFSPKX4/);
});
