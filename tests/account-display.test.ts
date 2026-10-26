import assert from "node:assert/strict";
import test from "node:test";
import { callDuration, clockLabel, extensionSetup, formatPhone, helpTopic, invoiceNumber, money, monthlyPrice, perMinute, personFirstName, personInitials, planHighlights, usagePercent, wholeMoney } from "../lib/account-display.ts";
import { navIsActive, workspaceCrumb } from "../lib/account-nav.ts";

test("a signed-in name becomes a greeting and initials", () => {
  assert.equal(personFirstName("Agboola"), "Agboola");
  assert.equal(personFirstName("Agbo Ola"), "Agbo");
  assert.equal(personInitials("Agboola"), "AG");
  assert.equal(personInitials("Agbo Ola"), "AO");
});

test("plan cards list the people, minutes, and the features that card is meant to show", () => {
  const solo = { name: "Solo", seats: 1, includedMinutes: 200, features: ["numbers", "softphone", "voicemail"] };
  const small = { name: "Small Business", seats: 5, includedMinutes: 800, features: ["numbers", "porting", "softphone", "voicemail", "business_hours", "ring_groups", "desk_phones", "ai"] };
  const team = { name: "Team", seats: 10, includedMinutes: 2000, features: [...small.features, "queues", "reporting"] };
  assert.deepEqual(planHighlights(solo), ["1 person", "200 outbound minutes", "Softphones", "Voicemail & forwarding"]);
  assert.deepEqual(planHighlights(small, solo), ["Up to 5 people", "800 outbound minutes", "Softphones", "Voicemail & forwarding", "Desk phones", "Business hours", "Ring groups", "AI receptionist"]);
  assert.deepEqual(planHighlights(team, small), ["Up to 10 people", "2,000 outbound minutes", "Everything in Small Business", "Call queues", "Call reporting"]);
});

test("billing amounts and minute use stay inside the period", () => {
  assert.equal(money(39), "$39.00");
  assert.equal(wholeMoney(39), "$39");
  assert.equal(wholeMoney(39.5), "$39.50");
  assert.equal(usagePercent(320, 800), 40);
  assert.equal(usagePercent(0, 0), 0);
  assert.equal(invoiceNumber(1), "INV-001");
  assert.equal(formatPhone("3025550101"), "(302) 555-0101");
  assert.equal(monthlyPrice("1.1"), "$1.10");
});

test("call minutes, extension setup, and help topics stay readable", () => {
  assert.equal(perMinute(70, 1000), "$0.07 / min");
  assert.equal(callDuration(92), "1:32");
  assert.equal(clockLabel("09:00"), "09:00 AM");
  assert.equal(clockLabel("17:00"), "05:00 PM");
  assert.equal(extensionSetup("created").label, "Provisioned");
  assert.equal(extensionSetup("failed").label, "Needs attention");
  assert.equal(helpTopic("How do I get my first business number?"), "numbers");
  assert.equal(helpTopic("Where can I check my remaining minutes?"), "billing");
  assert.equal(helpTopic("How do I add a team member?"), "phone");
});

test("the account shell names the overview and the billing pages", () => {
  assert.deepEqual(workspaceCrumb("/account"), { parent: "Workspace", current: "Overview" });
  assert.deepEqual(workspaceCrumb("/account/billing/plan"), { parent: "Account", current: "Usage & billing" });
  assert.equal(navIsActive("/account/billing/plan", "/account/billing", false), true);
  assert.equal(navIsActive("/account/numbers", "/account", true), false);
});
