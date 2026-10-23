import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequestedDid, readDids } from "../lib/did-list.ts";
import { numberPurchaseMode } from "../lib/number-order.ts";
import { idFromPbx } from "../lib/pbx-id.ts";
import { readRateCenters, regionAllowed } from "../lib/places.ts";

test("a number request has to be a full 10-digit inventory number", () => {
  assert.equal(normalizeRequestedDid("832"), "");
  assert.equal(normalizeRequestedDid("A Houston local number"), "");
  assert.equal(normalizeRequestedDid("(832) 555-0100"), "8325550100");
  assert.equal(normalizeRequestedDid("1-832-555-0100"), "8325550100");
  assert.equal(normalizeRequestedDid("0125550100"), "");
});

test("inventory results keep real DIDs and can return the whole list", () => {
  const body = { dids: [{ did: "8325550100", ratecenter: "HOUSTON", state: "TX", perminute_monthly: "0.85" }, { did: "832" }, "not-a-number"] };
  assert.deepEqual(readDids(body, 20), [{ did: "8325550100", ratecenter: "HOUSTON", state: "TX", monthly: "0.85" }]);
  const many = { dids: Array.from({ length: 25 }, (_, index) => ({ did: `832555${String(index).padStart(4, "0")}` })) };
  assert.equal(readDids(many, 20).length, 20);
  assert.equal(readDids(many, 0).length, 25);
});

test("number buying is manual until automatic buying is switched on", () => {
  assert.equal(numberPurchaseMode(false, false), "off");
  assert.equal(numberPurchaseMode(false, true), "off");
  assert.equal(numberPurchaseMode(true, false), "manual");
  assert.equal(numberPurchaseMode(true, true), "automatic");
});

test("state and city lists reject a typed code that is not a real place", () => {
  assert.equal(regionAllowed("US", "TX"), true);
  assert.equal(regionAllowed("US", "Texas"), false);
  assert.equal(regionAllowed("CA", "ON"), true);
  assert.equal(regionAllowed("US", "ON"), false);
  assert.deepEqual(readRateCenters({ ratecenters: [{ ratecenter: "HOUSTON" }, { ratecenter: "AUSTIN" }, "DALLAS"] }), ["AUSTIN", "DALLAS", "HOUSTON"]);
});

test("a created 3CX user id can come from the Location header", () => {
  assert.equal(idFromPbx({}, "https://pbx.example.com/xapi/v1/Users(38)"), 38);
  assert.equal(idFromPbx({ Id: 12 }, ""), 12);
  assert.equal(idFromPbx(null, ""), 0);
});
