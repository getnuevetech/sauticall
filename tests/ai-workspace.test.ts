import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_AI_SYSTEMS } from "../lib/ai-account.ts";
import { INSTRUCTION_MAX, accountAiPath, nextSetupStep, serviceChecks, switchCodeFor, validateAccountInstructions, workspaceProfile } from "../lib/ai-workspace.ts";

const open = { included: true, named: false, hasInstructions: false, extensionAssigned: false, serviceOn: false, termsOpen: false };

test("each service keeps only its own setup checks", () => {
  const voice = serviceChecks("tts", open).map((item) => item.key);
  assert.deepEqual(voice, ["plan", "configured", "instructions", "calls"]);
  assert.equal(workspaceProfile("tts").instructionTab, "Script & instructions");
  assert.equal(workspaceProfile("tts").usesExtension, false);
  const speech = serviceChecks("stt", open).map((item) => item.key);
  assert.deepEqual(speech, ["plan", "configured", "instructions", "calls"]);
  assert.equal(workspaceProfile("stt").instructionTab, "Recognition settings");
  const receptionist = serviceChecks("receptionist", open).map((item) => item.key);
  assert.deepEqual(receptionist, ["plan", "enabled", "configured", "extension", "instructions", "calls"]);
  assert.equal(workspaceProfile("notifications").instructionTab, "Script & instructions");
  assert.equal(workspaceProfile("outbound_assistant").usesExtension, true);
  assert.match(workspaceProfile("outbound_assistant").workflow, /not sent through the receptionist/);
});

test("a service that is not on the plan shows plan access only", () => {
  const checks = serviceChecks("tts", { ...open, included: false });
  assert.deepEqual(checks.map((item) => item.key), ["plan"]);
  assert.equal(checks[0].done, false);
  const step = nextSetupStep("tts", { ...open, included: false }, "Team");
  assert.equal(step.href, "/account/billing/plan");
  assert.match(step.summary, /Not included on Team/);
});

test("the next action follows plan, name, instructions, extension, then enablement", () => {
  assert.equal(nextSetupStep("receptionist", open, "Team").href, "/account/ai/services/receptionist?tab=configuration");
  const named = nextSetupStep("receptionist", { ...open, named: true }, "Team");
  assert.equal(named.href, "/account/ai/services/receptionist?tab=instructions");
  const written = nextSetupStep("receptionist", { ...open, named: true, hasInstructions: true }, "Team");
  assert.equal(written.label, "Create AI extension");
  assert.equal(written.href, "/account/ai/extensions");
  const assigned = nextSetupStep("tts", { ...open, named: true, hasInstructions: true }, "Team");
  assert.equal(assigned.href, "/account/ai/services/tts?tab=activity");
  assert.match(assigned.summary, /Live calls stay off/);
});

test("live calls stay unchecked after setup is complete", () => {
  const checks = serviceChecks("receptionist", { included: true, named: true, hasInstructions: true, extensionAssigned: true, serviceOn: true, termsOpen: false });
  const calls = checks.find((item) => item.key === "calls");
  assert.equal(calls?.done, false);
  assert.match(calls?.detail || "", /Off/);
  const voice = serviceChecks("tts", { included: true, named: true, hasInstructions: true, extensionAssigned: true, serviceOn: true, termsOpen: false });
  assert.equal(voice.some((item) => item.key === "extension"), false);
  assert.equal(voice.find((item) => item.key === "calls")?.done, false);
});

test("customer instructions stay on this account and cannot leave the AI pages", () => {
  const body = validateAccountInstructions("  Greeting:\nHello  ");
  assert.equal(body.ok && body.body, "Greeting:\nHello");
  const long = validateAccountInstructions("a".repeat(INSTRUCTION_MAX + 1));
  assert.equal(long.ok, false);
  assert.equal(accountAiPath("/account/ai/services/tts?tab=instructions", "/account/ai"), "/account/ai/services/tts?tab=instructions");
  assert.equal(accountAiPath("https://example.com", "/account/ai"), "/account/ai");
  assert.equal(accountAiPath("/account/ai/../../admin", "/account/ai"), "/account/ai");
  assert.equal(switchCodeFor("tts"), "");
  assert.equal(switchCodeFor("receptionist"), "receptionist");
  for (const system of ACCOUNT_AI_SYSTEMS) {
    const profile = workspaceProfile(system.code);
    assert.equal(profile.template.length > 0, true);
    assert.equal(profile.template.length <= INSTRUCTION_MAX, true);
    assert.match(profile.guidance.join(" "), /safety rules/);
  }
});
