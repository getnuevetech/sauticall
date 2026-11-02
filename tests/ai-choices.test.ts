import assert from "node:assert/strict";
import test from "node:test";
import { ACCENTS, accentsForPlan, defaultAccentIds, isOfficeTime, packOfficeHours, promptTemplateText, readOfficeHours, speakingDirections, spokenVoiceFor as spokenVoice, storedVoice } from "../lib/ai-choices.ts";

test("the accent catalog covers every region and stays unique", () => {
  assert.ok(ACCENTS.length >= 100);
  assert.ok(new Set(ACCENTS.map((accent) => accent.region)).size >= 6);
  assert.equal(new Set(ACCENTS.map((accent) => accent.id)).size, ACCENTS.length);
  assert.ok(ACCENTS.some((accent) => accent.id === "en-ng"));
  assert.ok(ACCENTS.some((accent) => accent.id === "en-jp"));
});

test("an admin accent list overrides the plan default", () => {
  const open = defaultAccentIds({ features: ["ai", "ai_any_language"], custom: false });
  const full = defaultAccentIds({ features: ["ai", "ai_any_language", "queues"], custom: false });
  const core = defaultAccentIds({ features: ["ai"], custom: false });
  assert.equal(defaultAccentIds({ features: ["numbers"] }).length, 0);
  assert.ok(core.length > 0);
  assert.ok(open.length > core.length);
  assert.ok(full.length > open.length);
  assert.deepEqual(accentsForPlan({ features: ["ai", "ai_any_language"], accents: [] }), []);
  assert.deepEqual(accentsForPlan({ features: ["ai"], accents: ["en-gb", "nope"] }), ["en-gb"]);
  assert.equal(storedVoice("en-ng", ["en-us"]).ok, false);
  assert.equal(storedVoice("en-ng", ["en-ng"]).ok, true);
  assert.equal(storedVoice("marin").ok, true);
  assert.equal(spokenVoice("Marin"), "marin");
  assert.notEqual(spokenVoice("en-ng", "woman"), spokenVoice("en-ng", "man"));
  assert.equal(spokenVoice("en-ng", "neutral"), "alloy");
  assert.match(speakingDirections({ voiceLabel: "en-ng", gender: "woman", language: "en-NG", afterHours: "09:00|17:00|message|" }), /woman/);
});

test("office hours are two times and a chosen after-hours action", () => {
  const hours = packOfficeHours({ open: "09:07", close: "17:00", action: "transfer", target: "516" });
  assert.equal(isOfficeTime(hours.open), true);
  assert.equal(hours.packed, `${hours.open}|17:00|transfer|516`);
  assert.deepEqual(readOfficeHours(hours.packed), { open: hours.open, close: "17:00", action: "transfer", target: "516" });
  assert.equal(readOfficeHours("Take a message").action, "message");
  assert.match(speakingDirections({ voiceLabel: "en-ng", language: "en-NG", afterHours: hours.packed }), /Nigerian/);
  assert.match(speakingDirections({ voiceLabel: "en-ng", language: "en-NG", afterHours: hours.packed }), /immediately/);
  const receptionist = promptTemplateText("receptionist");
  assert.match(promptTemplateText("general_business"), /transfer immediately/);
  assert.match(promptTemplateText("after_hours"), /office is closed/);
  assert.match(receptionist, /not available/);
  assert.match(receptionist, /take a message/);
  assert.equal(promptTemplateText("missing"), "");
  assert.equal(receptionist.includes("get_addressbook"), false);
  assert.equal(receptionist.includes("spam_detected"), false);
});
