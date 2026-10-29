import assert from "node:assert/strict";
import test from "node:test";
import { customerAiState, featureReady, validateAssignment, validateEngine, type AiEngineRecord } from "../lib/ai-system.ts";

const voice: AiEngineRecord = { id: 1, name: "Voice", kind: "tts", model: "sauticall-voice-1", endpoint: "https://voice.internal.example", secretRef: "vault:voice", enabled: true };
const outbound: AiEngineRecord = { id: 2, name: "Outbound", kind: "llm", model: "sauticall-outbound-1", endpoint: "https://outbound.internal.example", secretRef: "vault:outbound", enabled: true };

test("the master switch closes every service", () => {
  const open = new Set(["notifications", "receptionist"]);
  assert.equal(featureReady(open, "notifications"), false);
  assert.equal(featureReady(new Set(["master", "notifications"]), "notifications"), true);
  assert.equal(featureReady(new Set(["master"]), "receptionist"), false);
});

test("a customer sees the admin switch before the plan", () => {
  assert.equal(customerAiState({ master: false, feature: true, planIncludes: true }).label, "Turned off by SautiCall");
  assert.equal(customerAiState({ master: true, feature: false, planIncludes: true }).code, "off");
  assert.equal(customerAiState({ master: true, feature: true, planIncludes: false }).code, "not_on_plan");
  assert.equal(customerAiState({ master: true, feature: true, planIncludes: true }).code, "included");
});

test("two engines can be assigned to different jobs", () => {
  const voiceJob = validateAssignment("tts", voice.id, [voice, outbound]);
  const callJob = validateAssignment("outbound_assistant", outbound.id, [voice, outbound]);
  assert.equal(voiceJob.ok && callJob.ok, true);
  if (voiceJob.ok && callJob.ok) {
    assert.equal(voiceJob.engineId, 1);
    assert.equal(callJob.engineId, 2);
  }
  const off = validateAssignment("tts", 3, [{ ...voice, id: 3, enabled: false }]);
  assert.equal(off.ok, false);
  const secret = validateEngine({ name: "Voice", kind: "tts", model: "sauticall-voice-1", endpoint: "https://voice.internal.example", secretRef: "sk-live-secret", enabled: true });
  assert.equal(secret.ok, false);
  const blank = validateEngine({ name: "Voice", kind: "tts", model: "sauticall-voice-1", endpoint: "", secretRef: "vault:voice", enabled: true });
  assert.equal(blank.ok, false);
});
