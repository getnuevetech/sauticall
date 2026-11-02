import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { classifyCallControlProbe, describeStoredConnection, fallbackExtension, fallbackVoice, freshProviderSetup, freshTalk, greetingResponse, isPhoneExtensionNumber, liveCallDecision, matchRealtimeProtocol, mediaWasOpen, pbxOrigin, pbxTransferDestination, phoneExtensionRouteMessage, providerSetupAction, readRealtimeEvent, realtimeSessionUpdate, resolveProgrammableCall, selectRealtimeEngine, servicePrincipalDial, servicePrincipalDirections, spokenVoice, stepTalk, transferAttempts, transferCanRetry, transferDestination, transferFailureLine, transferFailureText, unavailableSpeech } from "../lib/call-control-plan.ts";
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
  assert.equal(spokenVoice("en-ng"), spokenVoice("en-ng"));
  assert.notEqual(spokenVoice("en-ng"), "custom");
});

test("a 3CX hostname is accepted and the Service Principal name is not an address", () => {
  assert.equal(pbxOrigin("kwiktech.3cx.us"), "https://kwiktech.3cx.us");
  assert.equal(pbxOrigin("https://kwiktech.3cx.us/xapi/v1"), "https://kwiktech.3cx.us");
  assert.throws(() => pbxOrigin("sauticall"), /Service Principal name/);
  assert.throws(() => pbxOrigin("http://kwiktech.3cx.us"), /https/);
});

test("a phone extension is not the Service Principal route point", () => {
  assert.equal(isPhoneExtensionNumber("529"), true);
  assert.equal(isPhoneExtensionNumber("sauticall"), false);
  assert.equal(servicePrincipalDial("sauticall").dialable, false);
  const directions = servicePrincipalDirections("sauticall", "9708430420");
  assert.match(directions, /keypad cannot dial/);
  assert.match(directions, /Call 9708430420/);
  assert.match(directions, /sends the call to sauticall/);
  const message = phoneExtensionRouteMessage("529", "sauticall", "9708430420");
  assert.match(message, /529 is a user extension/);
  assert.match(message, /Call 9708430420/);
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

test("one call keeps a single greeting and drops a second voice", () => {
  const greeting = greetingResponse("Thank you for calling.");
  assert.match(greeting.response.instructions, /Say exactly this one sentence/);
  assert.match(greeting.response.instructions, /Thank you for calling\./);
  let state = freshTalk();
  const first = stepTalk(state, { type: "response_started", id: "greet" });
  state = first.state;
  assert.equal(first.cancel, "");
  assert.equal(stepTalk(state, { type: "audio", id: "greet" }).play, true);
  const overlap = stepTalk(state, { type: "response_started", id: "other" });
  assert.equal(overlap.cancel, "other");
  assert.equal(stepTalk(overlap.state, { type: "audio", id: "other" }).play, false);
  const echo = stepTalk(state, { type: "caller_spoke" });
  assert.equal(echo.cancel, "");
  assert.equal(echo.clearPlayback, false);
  const dropped = stepTalk({ ...overlap.state, dropped: overlap.state.dropped }, { type: "response_finished", id: "other" });
  assert.equal(dropped.state.greetingOpen, true);
  assert.equal(dropped.forwardCaller, false);
  state = stepTalk(state, { type: "response_finished", id: "greet" }).state;
  assert.equal(state.greetingOpen, false);
  state = stepTalk(state, { type: "response_started", id: "answer" }).state;
  const interrupt = stepTalk(state, { type: "caller_spoke" });
  assert.equal(interrupt.cancel, "answer");
  assert.equal(interrupt.clearPlayback, true);
});

test("the greeting opens the microphone when the finished id does not match", () => {
  let state = stepTalk(freshTalk(), { type: "response_started", id: "" }).state;
  assert.equal(state.active, "current");
  const played = stepTalk(state, { type: "audio", id: "resp_greet" });
  assert.equal(played.play, true);
  const finished = stepTalk(state, { type: "response_finished", id: "resp_greet" });
  assert.equal(finished.state.greetingOpen, false);
  assert.equal(finished.forwardCaller, true);
  const audioDone = readRealtimeEvent({ type: "response.output_audio.done", response_id: "resp_greet" });
  assert.equal(audioDone.type, "response_finished");
  const missed = stepTalk(freshTalk(), { type: "greeting_timeout" });
  assert.equal(missed.state.greetingOpen, false);
  assert.equal(missed.forwardCaller, true);
  let setup = freshProviderSetup();
  const rejected = providerSetupAction(setup, "error");
  assert.equal(rejected.action, "retry");
  setup = rejected.state;
  assert.equal(providerSetupAction(setup, "session_updated").action, "greet");
  assert.equal(providerSetupAction(freshProviderSetup(), "timeout").action, "greet");
  assert.equal(readRealtimeEvent({ type: "session.updated" }).type, "session_updated");
  const failure = readRealtimeEvent({ type: "error", error: { message: "Unknown voice coral" } });
  assert.equal(failure.type, "provider_error");
  if (failure.type === "provider_error") assert.match(failure.message, /coral/);
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
  assert.match(session.session.instructions, /immediately/);
  assert.deepEqual(session.session.tools[0].parameters.properties.destination.enum, ["516"]);
  assert.match(session.session.instructions, /answer the caller/i);
  assert.equal(session.session.audio.output.voice, "alloy");
  const xai = realtimeSessionUpdate({ instructions: "Answer from approved knowledge.", voice: spokenVoice("en-ng", "woman", "xai"), transfers: ["516"], protocol: "xai" });
  assert.equal(xai.session.voice, spokenVoice("en-ng", "woman", "xai"));
  assert.equal("voice" in xai.session.audio.output, false);
  assert.notEqual(spokenVoice("en-ng", "woman", "xai"), spokenVoice("en-ng", "man", "xai"));
  assert.equal(fallbackVoice("xai"), "eve");
  assert.equal(fallbackVoice("openai"), "alloy");
  assert.equal(transferDestination("{\"destination\":\"extension 516\"}", ["516", "800"]), "516");
  assert.equal(transferDestination("{\"destination\":\"Ada\"}", [{ number: "516", label: "Ada", kind: "extension" }, { number: "800", label: "Main", kind: "ring" }]), "516");
  assert.equal(pbxTransferDestination("516", "extension"), "Extension.516.");
  assert.equal(pbxTransferDestination("800", "ring"), "RingGroup.800.");
  assert.equal(pbxTransferDestination("801", "queue"), "Queue.801.");
  assert.deepEqual(transferAttempts({ number: "528", kind: "extension" }), ["528", "Extension.528."]);
  const missing = "3CX transfer returned 424 {\"finalstatus\":\"Rejected\",\"reason\":\"NotSpecified\",\"result\":null,\"reasontext\":\"Doesnt exist\"}";
  assert.equal(transferCanRetry(missing, "Extension.528.", "528"), true);
  assert.equal(transferCanRetry(missing, "528", "Extension.528."), false);
  assert.equal(transferCanRetry("3CX transfer returned 422", "528", "Extension.528."), true);
  assert.equal(transferCanRetry("3CX transfer returned 500", "528", "Extension.528."), false);
  const missingLine = transferFailureLine(missing, "extension 528");
  assert.match(missingLine, /not available/);
  assert.match(missingLine, /take a message/);
  assert.match(unavailableSpeech(missingLine).response.instructions, /Say exactly this/);
  const held = stepTalk(freshTalk(), { type: "transfer" });
  assert.equal(held.state.holding, true);
  const resumed = stepTalk(held.state, { type: "transfer_failed" });
  assert.equal(resumed.state.holding, false);
  assert.equal(resumed.forwardCaller, true);
  assert.equal(transferFailureText({ response: { status: 422, data: "destination" } }), "3CX transfer returned 422 destination");
  const handoff = stepTalk(freshTalk(), { type: "transfer" });
  assert.equal(handoff.clearPlayback, true);
  assert.equal(handoff.state.holding, true);
  assert.equal(stepTalk(handoff.state, { type: "audio", id: "late" }).play, false);
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
