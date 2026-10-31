import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceComplete, activationState, customerAiState, featureReady, validateAssignment, validateEngine, validateEngineKey, type AiEngineRecord } from "../lib/ai-system.ts";

const voice: AiEngineRecord = { id: 1, name: "Voice", kind: "tts", model: "sauticall-voice-1", endpoint: "https://voice.internal.example", secretRef: "vault:voice", hasSecret: true, enabled: true };
const outbound: AiEngineRecord = { id: 2, name: "Outbound", kind: "llm", model: "sauticall-outbound-1", endpoint: "https://outbound.internal.example", secretRef: "", hasSecret: true, enabled: true };

test("the master switch closes every service", () => {
  const open = new Set(["notifications", "receptionist"]);
  assert.equal(featureReady(open, "notifications"), false);
  assert.equal(featureReady(new Set(["master", "notifications"]), "notifications"), true);
  assert.equal(featureReady(new Set(["master"]), "receptionist"), false);
});

test("notifications stay off until terms, a grant, and the customer's own switch", () => {
  const base = { globalOn: true, planIncludes: true, publishedVersion: 1, acceptedVersion: 0, grant: "none" as const, customerEnabled: false, reviewRequired: true };
  assert.equal(activationState(base).code, "pending_terms");
  assert.equal(activationState({ ...base, acceptedVersion: 1 }).code, "ready_to_request");
  assert.equal(activationState({ ...base, acceptedVersion: 1, grant: "requested" }).code, "pending_review");
  assert.equal(activationState({ ...base, acceptedVersion: 1, grant: "granted" }).label, "Off. You can turn it on.");
  assert.equal(activationState({ ...base, acceptedVersion: 1, grant: "granted", customerEnabled: true }).code, "active");
  assert.equal(activationState({ ...base, acceptedVersion: 1, grant: "suspended", customerEnabled: true }).code, "suspended");
  assert.equal(activationState({ ...base, publishedVersion: 2, acceptedVersion: 1, grant: "granted", customerEnabled: true }).code, "pending_terms");
  assert.equal(acceptanceComplete(["authority", "permission", "identity", "optout"]), false);
  assert.equal(acceptanceComplete(["authority", "permission", "identity", "optout", "charges"]), true);
});

test("a receptionist without a separate agreement can be on when the plan includes it", () => {
  assert.equal(activationState({
    globalOn: true,
    planIncludes: true,
    publishedVersion: 0,
    acceptedVersion: 0,
    grant: "none",
    customerEnabled: true,
    reviewRequired: false,
  }).code, "active");
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
  const shared = validateAssignment("receptionist", voice.id, [voice, outbound]);
  const alsoShared = validateAssignment("tts", voice.id, [voice, outbound]);
  assert.equal(shared.ok && alsoShared.ok, true);
  const sameModel = validateAssignment("personal_assistant", outbound.id, [voice, outbound]);
  assert.equal(sameModel.ok, true);
  const secret = validateEngine({ name: "Voice", kind: "tts", model: "sauticall-voice-1", endpoint: "https://voice.internal.example", secretRef: "sk-live-secret", enabled: true });
  assert.equal(secret.ok, false);
  const blank = validateEngine({ name: "Voice", kind: "tts", model: "sauticall-voice-1", endpoint: "", secretRef: "", enabled: true });
  assert.equal(blank.ok, false);
  const first = validateEngine({ name: "Language A", kind: "llm", model: "model-a", endpoint: "https://a.example/v1", secretRef: "", enabled: true });
  const second = validateEngine({ name: "Language B", kind: "llm", model: "model-b", endpoint: "https://b.example/v1", secretRef: "", enabled: true });
  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.engine.endpoint, "https://a.example/v1");
    assert.equal(second.engine.endpoint, "https://b.example/v1");
  }
  const key = validateEngineKey("sk-proj-abcdef12");
  const other = validateEngineKey("vendor_key_without_prefix");
  assert.equal(key.ok && key.key, "sk-proj-abcdef12");
  assert.equal(other.ok && other.key, "vendor_key_without_prefix");
  assert.equal(validateEngineKey("has spaces").ok, false);
});
