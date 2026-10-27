import assert from "node:assert/strict";
import test from "node:test";
import { lineCodecs } from "../lib/line-codecs.ts";

test("a line account keeps only codecs VoIP.ms accepts", () => {
  assert.equal(lineCodecs("ulaw;alaw;g729"), "ulaw;g729");
  assert.equal(lineCodecs("ulaw, alaw, gsm"), "ulaw;gsm");
  assert.equal(lineCodecs("G.729;GSM"), "g729;gsm");
  assert.equal(lineCodecs("all"), "all");
  assert.equal(lineCodecs("ulaw;all;gsm"), "all");
  assert.equal(lineCodecs("g722;opus"), "ulaw");
  assert.equal(lineCodecs(""), "ulaw");
});
