import assert from "node:assert/strict";
import test from "node:test";
import { matchListedSubaccount, readCreatedSubaccount, readListedSubaccounts, subaccountUpdateParams } from "../lib/subaccount-ref.ts";

test("a created line keeps the numeric id and the SIP account name", () => {
  const created = readCreatedSubaccount({ status: "success", id: 99785, account: "100000_VoIP" });
  assert.deepEqual(created, { id: "99785", account: "100000_VoIP" });
});

test("a SIP account name is not treated as the numeric id", () => {
  assert.equal(readCreatedSubaccount({ id: "100000_VoIP", account: "100000_VoIP" }).id, "");
  assert.equal(readCreatedSubaccount({ account: "100000_sc0007" }).account, "100000_sc0007");
});

test("a listed line is matched by username, account suffix, or description", () => {
  const listed = readListedSubaccounts({
    accounts: [
      { id: 99785, account: "100000_sc0007", username: "sc0007", description: "SautiCall 7" },
      { id: "not-a-number", account: "100000_other", username: "other", description: "Other" },
      { username: "missing" },
    ],
  });
  assert.equal(listed.length, 2);
  assert.equal(listed[1].id, "");
  assert.equal(matchListedSubaccount(listed, "sc0007", "unused")?.id, "99785");
  assert.equal(matchListedSubaccount(listed, "nope", "SautiCall 7")?.account, "100000_sc0007");
  assert.equal(matchListedSubaccount(listed, "other", "unused")?.account, "100000_other");
});

test("a line update sends the numeric id and leaves the SIP account name out", () => {
  const params = subaccountUpdateParams("99785", {
    account: "100000_sc0007",
    description: "SautiCall 7",
    password: "abc123",
    auth_type: "1",
  });
  assert.equal(params.id, "99785");
  assert.equal("account" in params, false);
  assert.equal(params.description, "SautiCall 7");
  assert.equal(params.password, "abc123");
  assert.equal(subaccountUpdateParams("100000_sc0007", { description: "SautiCall 7" }).id, undefined);
});
