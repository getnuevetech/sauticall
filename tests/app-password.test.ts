import assert from "node:assert/strict";
import test from "node:test";
import { appPassword, voipLinePasswordOk } from "../lib/app-password.ts";

test("a line password stays inside the characters VoIP.ms accepts", () => {
  for (let i = 0; i < 40; i += 1) {
    const password = appPassword();
    assert.equal(password.includes("@"), false);
    assert.equal(voipLinePasswordOk(password), true);
    assert.equal(password.length, 16);
  }
});
