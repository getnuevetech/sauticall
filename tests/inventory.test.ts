import assert from "node:assert/strict";
import test from "node:test";
import { clientEmail, clientPlace, personName, readVoipClientId } from "../lib/client-profile.ts";
import { didMatches, parseDigitSearch } from "../lib/did-search.ts";
import { normalizeRequestedDid, readDids } from "../lib/did-list.ts";
import { numberPurchaseMode } from "../lib/number-order.ts";
import { chooseExtension, extensionRange } from "../lib/extension-numbers.ts";
import { idFromPbx } from "../lib/pbx-id.ts";
import { pbxAccessMessage, roleFromToken } from "../lib/pbx-access.ts";
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

test("a number search can target the whole number, its start, or its end", () => {
  const exact = parseDigitSearch("number", "(713) 555-0100");
  const prefix = parseDigitSearch("prefix", "713");
  const suffix = parseDigitSearch("suffix", "0100");
  assert.equal(exact.ok && exact.search.query, "7135550100");
  assert.equal(prefix.ok && didMatches("7135550199", prefix.search), true);
  assert.equal(prefix.ok && didMatches("8325550199", prefix.search), false);
  assert.equal(suffix.ok && didMatches("2815550100", suffix.search), true);
  assert.equal(parseDigitSearch("prefix", "71").ok, false);
  assert.equal(parseDigitSearch("number", "713555").ok, false);
});

test("a VoIP.ms client stays tied to the SautiCall customer", () => {
  assert.deepEqual(personName("Ada Customer"), { first: "Ada", last: "Customer" });
  assert.equal(clientEmail(12, "ada@example.com", "clients.example.com"), "customer-12@clients.example.com");
  assert.equal(clientEmail(12, "ada@example.com", ""), "ada@example.com");
  assert.equal(clientPlace({}).state, "TX");
  assert.equal(clientPlace({}).phone, "7135550100");
  assert.equal(clientPlace({ emergency: { country: "US", state: "TX", city: "HOUSTON", address: "1200 Main", zip: "77002" } }).city, "HOUSTON");
  assert.equal(readVoipClientId({ client: 561115 }), "561115");
  assert.equal(readVoipClientId({ clients: [{ client: 42, email: "a@b.c" }] }), "42");
});

test("state and city lists reject a typed code that is not a real place", () => {
  assert.equal(regionAllowed("US", "TX"), true);
  assert.equal(regionAllowed("US", "Texas"), false);
  assert.equal(regionAllowed("CA", "ON"), true);
  assert.equal(regionAllowed("US", "ON"), false);
  assert.deepEqual(readRateCenters({ ratecenters: [{ ratecenter: "HOUSTON" }, { ratecenter: "AUSTIN" }, "DALLAS"] }), ["AUSTIN", "DALLAS", "HOUSTON"]);
});

test("a 403 from 3CX names the API role that was refused", () => {
  const header = Buffer.from(JSON.stringify({ MaxRole: "users" })).toString("base64url");
  assert.equal(roleFromToken(`aa.${header}.zz`), "users");
  assert.match(pbxAccessMessage(403, "users", "Access denied."), /System Owner/);
  assert.match(pbxAccessMessage(403, "system_owners", ""), /console restrictions/);
});

test("extension numbers start at 2000 and skip numbers already taken", () => {
  assert.deepEqual(extensionRange(1), { from: 2000, to: 2009 });
  assert.deepEqual(extensionRange(3), { from: 2020, to: 2029 });
  assert.equal(chooseExtension(1, ["2000"], [1]), "2001");
  const ownBlock = Array.from({ length: 10 }, (_, index) => String(2000 + index));
  assert.equal(chooseExtension(1, ownBlock, [1, 2]), "2020");
  assert.equal(chooseExtension(1, [...ownBlock, "2020"], [1, 2, 3]), "2030");
});

test("a created 3CX user id can come from the Location header", () => {
  assert.equal(idFromPbx({}, "https://pbx.example.com/xapi/v1/Users(38)"), 38);
  assert.equal(idFromPbx({ Id: 12 }, ""), 12);
  assert.equal(idFromPbx(null, ""), 0);
});
