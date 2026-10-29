import assert from "node:assert/strict";
import test from "node:test";
import { emergencyCarrierParams, formatAddress, parseEmergency } from "../lib/e911-address.ts";

test("a complete Houston address keeps its ZIP for every emergency call", () => {
  const parsed = parseEmergency({
    full_name: "Ag",
    street_number: "15211",
    street_name: "Park row",
    address_type: "APT",
    address_number: "1128",
    city: "Houston",
    state: "TX",
    country: "US",
    zip: "77084",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(formatAddress(parsed.address), "Ag, 15211 Park row APT 1128, Houston, TX 77084");
  const params = emergencyCarrierParams(parsed.address, "3345397005");
  assert.equal(params.zip, "77084");
  assert.equal(params.zip_code, "77084");
});
