import assert from "node:assert/strict";
import test from "node:test";
import { applyListen, choiceLine, dialBlockers, hoursOpen, normalizeNotifyPolicy, practiceAllowed, startListen } from "../lib/ai-notify.ts";

const openGate = {
  serviceOn: true,
  clipReady: true,
  businessName: "Texas Labz",
  callerId: "3345550100",
  consent: "They booked a visit on the website on 1 October 2026.",
  number: "7135550142",
  suppressed: false,
  purposeEnabled: true,
  promotional: false,
  promoAllowed: false,
  hoursOpen: true,
};

test("press 1 plays the message only after it finishes, and press 2 does not", () => {
  const listened = applyListen(startListen(1), { kind: "digit", digit: "1" });
  assert.equal(listened.state.outcome, "accepted");
  assert.equal(listened.state.contentPlayed, false);
  const finished = applyListen(listened.state, { kind: "finished" });
  assert.equal(finished.state.contentPlayed, true);
  const declined = applyListen(startListen(1), { kind: "digit", digit: "2" });
  assert.equal(declined.state.outcome, "declined");
  assert.equal(declined.state.contentPlayed, false);
  assert.equal(declined.suppress, false);
});

test("press 9 opts out, silence is not consent, and voicemail plays nothing", () => {
  const opted = applyListen(startListen(1), { kind: "digit", digit: "9" });
  assert.equal(opted.suppress, true);
  assert.equal(opted.state.contentPlayed, false);
  const again = applyListen(applyListen(startListen(1), { kind: "silence" }).state, { kind: "silence" });
  assert.equal(again.state.outcome, "no_choice");
  assert.equal(again.state.contentPlayed, false);
  const mailbox = applyListen(startListen(1), { kind: "voicemail" });
  assert.equal(mailbox.state.outcome, "voicemail");
  assert.equal(mailbox.state.contentPlayed, false);
  assert.equal(choiceLine("Texas Labz").includes("press 1"), true);
  assert.equal(choiceLine("Texas Labz").includes("press 9"), true);
});

test("a real call stays blocked until calling is connected", () => {
  const reasons = dialBlockers(openGate);
  assert.equal(practiceAllowed(reasons), true);
  const closed = dialBlockers({ ...openGate, hoursOpen: false, consent: "" });
  assert.equal(closed.some((reason) => reason.includes("permission")), true);
  assert.equal(practiceAllowed(closed), false);
  const promo = dialBlockers({ ...openGate, promotional: true, promoAllowed: false });
  assert.equal(promo.some((reason) => reason.includes("Promotional")), true);
});

test("calling hours follow the saved clock and time zone", () => {
  const policy = { windowStart: "09:00", windowEnd: "17:00", timeZone: "America/Chicago" };
  assert.equal(hoursOpen(new Date("2026-10-30T17:00:00.000Z"), policy), true);
  assert.equal(hoursOpen(new Date("2026-10-30T03:00:00.000Z"), policy), false);
  assert.equal(hoursOpen(new Date("2026-10-30T17:00:00.000Z"), { ...policy, windowStart: "", windowEnd: "", timeZone: "" }), false);
  assert.equal(normalizeNotifyPolicy({ repeats: 1, promoEnabled: false, windowStart: "00:00", windowEnd: "23:59", timeZone: "America/Chicago" }).ok, true);
});
