import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { classifyCallControlProbe, describeStoredConnection, fallbackExtension, isPhoneExtensionNumber, liveCallDecision, matchRealtimeProtocol, mediaWasOpen, phoneExtensionRouteMessage, readRealtimeEvent, realtimeSessionUpdate, resolveProgrammableCall, selectRealtimeEngine, spokenVoice } from "../lib/call-control-plan.ts";
import { downsample24kTo8k, upsample8kTo24k } from "../lib/pcm-rate.ts";
import { recordLiveSession } from "../lib/ai-virtual.ts";
import type { RouteBinding } from "../lib/ai-platform.ts";

const engine = { id: 1, name: "Voice", kind: "llm", model: "gpt-realtime", endpoint: "https://api.openai.com/v1/realtime", enabled: true, hasSecret: true };
const waiting: RouteBinding = { tenantId: 1, clientId: "sauticall", did: "9708430420", status: "AWAITING_READBACK", agentId: 4, promptVersionId: 9 };
const other: RouteBinding = { tenantId: 2, clientId: "other", did: "3035550100", status: "AWAITING_READBACK", agentId: 5, promptVersionId: 10 };

test("an empty stored connection is not treated as a new PBX request", () => {
  const described = describeStoredConnection({ enabled: false, hasAddress: false, hasClientId: false, hasSecret: false });
  assert.equal(described.ready, false);
  assert.match(described.missing, /same record/);
  const probe = classifyCallControlProbe({ connectionReady: false, tokenStatus: 0, callControlStatus: 0, version: "", xapiMessage: "", protocol: "", engineName: "" });
  assert.equal(probe.callControl, "unverified");
  assert.equal(probe.liveAudioReady, false);
});

test("call control is verified only from a 200 on the existing principal", () => {
  const refused = classifyCallControlProbe({ connectionReady: true, tokenStatus: 200, callControlStatus: 403, version: "20.0.10.1", xapiMessage: "Connected.", protocol: "openai", engineName: "Voice" });
  assert.equal(refused.callControl, "unsupported");
  assert.match(refused.missing, /existing Service Principal/);
  const ready = classifyCallControlProbe({ connectionReady: true, tokenStatus: 200, callControlStatus: 200, version: "20.0.10.1", xapiMessage: "Connected.", protocol: "openai", engineName: "Voice" });
  assert.equal(ready.callControl, "supported_verified");
  assert.equal(ready.liveAudioReady, true);
  const noVoice = classifyCallControlProbe({ connectionReady: true, tokenStatus: 200, callControlStatus: 200, version: "", xapiMessage: "", protocol: "", engineName: "" });
  assert.equal(noVoice.liveAudioReady, false);
  assert.match(noVoice.missing, /realtime voice engine/);
});

test("a chat model is not treated as telephone audio", () => {
  assert.equal(matchRealtimeProtocol({ ...engine, model: "gpt-4o", endpoint: "https://api.openai.com/v1/chat/completions" }), "");
  assert.equal(matchRealtimeProtocol(engine), "openai");
  assert.equal(matchRealtimeProtocol({ ...engine, model: "grok-voice", endpoint: "https://api.x.ai/v1/realtime" }), "xai");
  assert.equal(selectRealtimeEngine([{ ...engine, enabled: false }]), null);
  assert.equal(spokenVoice("Marin"), "marin");
  assert.equal(spokenVoice("custom"), "alloy");
});

test("a phone extension is not the Service Principal route point", () => {
  assert.equal(isPhoneExtensionNumber("529"), true);
  assert.equal(isPhoneExtensionNumber("ai-receptionist"), false);
  const message = phoneExtensionRouteMessage("529", "ai-receptionist");
  assert.match(message, /529 is a phone extension/);
  assert.match(message, /dial ai-receptionist/);
  assert.match(message, /Do not route the call to extension 529/);
});

test("one existing route point resolves the tenant and blocks the other company", () => {
  const internal = resolveProgrammableCall({ bindings: [waiting, other], appId: "sauticall", callerDid: "", callControlVerified: true });
  assert.equal(internal.ok && internal.binding.tenantId, 1);
  const external = resolveProgrammableCall({ bindings: [waiting, other], appId: "sauticall", callerDid: "3035550100", callControlVerified: true });
  assert.equal(external.ok, false);
  const shared = resolveProgrammableCall({ bindings: [{ ...waiting, clientId: "" }, { ...other, clientId: "" }], appId: "sauticall", callerDid: "3035550100", callControlVerified: true });
  assert.equal(shared.ok && shared.binding.tenantId, 2);
  const blocked = resolveProgrammableCall({ bindings: [waiting], appId: "sauticall", callerDid: "", callControlVerified: false });
  assert.equal(blocked.ok, false);
});

test("the live decision never places an outbound call", () => {
  const answer = liveCallDecision({ resolved: true, paused: false, masterOn: true, receptionistOn: true, suspended: false, customerEnabled: true, protocol: "openai", fallback: "800" });
  assert.equal(answer.answer, true);
  assert.equal(answer.placeCall, false);
  const off = liveCallDecision({ resolved: true, paused: false, masterOn: false, receptionistOn: true, suspended: false, customerEnabled: true, protocol: "openai", fallback: "800" });
  assert.equal(off.answer, false);
  assert.equal(off.transfer, "800");
  assert.equal(fallbackExtension("Ring group Main · 800"), "800");
  assert.equal(mediaWasOpen(320, 0), false);
  assert.equal(mediaWasOpen(320, 320), true);
});

test("provider audio is converted and tool calls stay explicit", () => {
  const pcm = Buffer.alloc(4);
  pcm.writeInt16LE(1000, 0);
  pcm.writeInt16LE(-1000, 2);
  const up = upsample8kTo24k(pcm);
  assert.equal(up.length, 12);
  assert.equal(downsample24kTo8k(up).readInt16LE(0), 1000);
  const audio = readRealtimeEvent({ type: "response.output_audio.delta", delta: Buffer.from([1, 2]).toString("base64") });
  assert.equal(audio.type, "audio");
  const tool = readRealtimeEvent({ type: "response.function_call_arguments.done", name: "transfer_to_approved_destination", arguments: "{\"destination\":\"516\"}", call_id: "c1" });
  assert.equal(tool.type, "tool");
  if (tool.type === "tool") assert.equal(tool.name, "transfer_to_approved_destination");
  const session = realtimeSessionUpdate({ instructions: "Answer from approved knowledge.", voice: "alloy", transfers: ["516"] });
  assert.equal(JSON.stringify(session).includes("make_call"), false);
  assert.equal(session.session.tools.length, 2);
});

test("a real media flag is stored only when requested and outbound stays off", () => {
  const db = new Database(":memory:");
  const id = recordLiveSession(db, {
    userId: 1,
    agentId: 4,
    promptVersionId: 9,
    pbxCallId: "55",
    state: "COMPLETED",
    mediaOpen: true,
    outcome: "transferred 516; bytes in 320; bytes out 320",
    startedAt: "2026-11-01T20:00:00.000Z",
    endedAt: "2026-11-01T20:01:00.000Z",
  });
  const row = db.prepare("SELECT media_open, place_call, outcome FROM ai_sessions WHERE id = ?").get(id) as { media_open: number; place_call: number; outcome: string };
  assert.equal(row.media_open, 1);
  assert.equal(row.place_call, 0);
  assert.match(row.outcome, /transferred 516/);
});
