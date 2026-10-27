import assert from "node:assert/strict";
import test from "node:test";
import { chooseResellerPackage } from "../lib/reseller-package.ts";

test("a line account uses the client's package, or a free package from the catalog", () => {
  const assigned = { packages: [{ value: "8378", description: "VoIP" }] };
  const catalog = { packages: [{ package: "100", name: "Paid", monthly_fee: "2.00", setup_fee: "1.00" }, { package: "200", name: "Free", monthly_fee: "0.00", setup_fee: "0" }] };
  assert.equal(chooseResellerPackage(assigned, catalog), "8378");
  assert.equal(chooseResellerPackage({ status: "no_package" }, catalog), "200");
  assert.equal(chooseResellerPackage(null, { packages: [{ package: "100", monthly_fee: "2.00", setup_fee: "5" }, { package: "300", monthly_fee: "1.00", setup_fee: "0" }] }), "300");
  assert.equal(chooseResellerPackage(null, { status: "no_package" }), "");
});
