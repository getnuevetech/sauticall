import { spokenVoiceFor } from "./ai-choices.ts";
import type { CapabilityStatus } from "./ai-virtual.ts";
import type { RouteBinding } from "./ai-platform.ts";

export type RealtimeProtocol = "" | "openai" | "xai" | "gemini" | "qwen";

export type EngineCandidate = {
  id: number;
  name: string;
  kind: string;
  model: string;
  endpoint: string;
  enabled: boolean;
  hasSecret: boolean;
};

export function matchRealtimeProtocol(engine: EngineCandidate): RealtimeProtocol {
  if (!engine.enabled || !engine.hasSecret) return "";
  const blob = `${engine.name} ${engine.kind} ${engine.model} ${engine.endpoint}`.toLowerCase();
  if (/qwen|dashscope/.test(blob)) return "qwen";
  if (/gemini|generativelanguage/.test(blob)) return "gemini";
  if (/x\.ai|grok/.test(blob)) return "xai";
  if (/realtime|gpt-4o-realtime|gpt-realtime/.test(blob)) return "openai";
  return "";
}

export function selectRealtimeEngine(engines: EngineCandidate[]) {
  for (const engine of engines) {
    const protocol = matchRealtimeProtocol(engine);
    if (protocol) return { ...engine, protocol };
  }
  return null;
}

export function spokenVoice(label: string, gender = "", protocol: "openai" | "xai" = "openai") {
  return spokenVoiceFor(label, gender, protocol);
}

export function fallbackVoice(protocol: "openai" | "xai") {
  return protocol === "xai" ? "eve" : "alloy";
}

export type TransferChoice = { number: string; label: string; kind: "extension" | "ring" | "queue" };

export function transferChoices(allowed: readonly (string | TransferChoice)[]): TransferChoice[] {
  const choices: TransferChoice[] = [];
  for (const item of allowed) {
    const choice = typeof item === "string" ? { number: item.trim(), label: "", kind: "extension" as const } : { number: item.number.trim(), label: item.label.trim(), kind: item.kind };
    if (!choice.number || choices.some((existing) => existing.number === choice.number)) continue;
    choices.push(choice);
  }
  return choices;
}

export function transferDestination(args: string, allowed: readonly (string | TransferChoice)[]) {
  const choices = transferChoices(allowed);
  let raw = "";
  try {
    raw = String((JSON.parse(args) as { destination?: string }).destination || "");
  } catch {
    raw = args;
  }
  const value = raw.trim();
  const exact = choices.find((item) => item.number === value);
  if (exact) return exact.number;
  const digits = value.replace(/\D/g, "");
  const byNumber = digits ? choices.find((item) => item.number === digits || item.number.replace(/\D/g, "") === digits) : undefined;
  if (byNumber) return byNumber.number;
  const folded = value.toLowerCase();
  const byLabel = choices.find((item) => item.label && folded.includes(item.label.toLowerCase()));
  return byLabel?.number || "";
}

export function transferChoice(number: string, allowed: readonly (string | TransferChoice)[]) {
  return transferChoices(allowed).find((item) => item.number === number) || { number, label: "", kind: "extension" as const };
}

export function pbxTransferDestination(number: string, kind: TransferChoice["kind"] = "extension") {
  const dn = number.trim();
  if (kind === "ring") return `RingGroup.${dn}.`;
  if (kind === "queue") return `Queue.${dn}.`;
  return `Extension.${dn}.`;
}

export function transferFailureText(error: unknown) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    if (response) {
      const detail = typeof response.data === "string" ? response.data : response.data ? JSON.stringify(response.data) : "";
      return `3CX transfer returned ${response.status || 0}${detail ? ` ${detail}` : ""}`.replace(/\s+/g, " ").trim().slice(0, 240);
    }
  }
  const message = error instanceof Error ? error.message : "Transfer failed.";
  return message.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function fallbackExtension(label: string) {
  const match = label.match(/(\d{2,6})\s*$/);
  return match?.[1] || "";
}

export function isPhoneExtensionNumber(value: string) {
  return /^\d{2,6}$/.test(value.trim());
}

export function pbxOrigin(address: string) {
  const raw = address.trim();
  if (!raw) throw new Error("Enter the 3CX hostname, for example https://kwiktech.3cx.us.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter the 3CX hostname, for example https://kwiktech.3cx.us.");
  }
  if (url.protocol !== "https:") throw new Error("The 3CX address must use https.");
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) throw new Error(`${raw} is the Service Principal name. The 3CX address is the hostname, for example https://kwiktech.3cx.us.`);
  if (host === "localhost" || host.endsWith(".local") || host === "169.254.169.254" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    throw new Error("Use the public 3CX hostname.");
  }
  return url.origin;
}

export function servicePrincipalDial(clientId: string) {
  const id = clientId.trim();
  return { id, dialable: false };
}

export function servicePrincipalDirections(clientId: string, did = "") {
  const id = clientId.trim();
  const number = did.replace(/\D/g, "");
  const name = id || "the Service Principal";
  const call = number ? `Call ${number}.` : "Call the outside phone number.";
  return `${name} is the Service Principal name on Integrations, API. A keypad cannot dial that name. On that same Service Principal, put the phone number in the DID field. ${call} 3CX then sends the call to ${name}. Leave a normal user extension out of this route. If no phone is registered on that user, 3CX ends the call.`;
}

export function phoneExtensionRouteMessage(extension: string, servicePrincipalId: string, did = "") {
  const number = extension.trim();
  return `${number} is a user extension. No phone is registered on it, so 3CX ends the call before the AI can answer. ${servicePrincipalDirections(servicePrincipalId, did)}`;
}

export function mediaWasOpen(bytesIn: number, bytesOut: number) {
  return bytesIn > 0 && bytesOut > 0;
}

export function resolveProgrammableCall(input: {
  bindings: RouteBinding[];
  appId: string;
  callerDid: string;
  callControlVerified: boolean;
}) {
  if (!input.callControlVerified) return { ok: false as const, reason: "call_control" as const };
  const appId = input.appId.trim();
  const caller = input.callerDid.replace(/\D/g, "");
  const callerTail = caller.length === 11 && caller.startsWith("1") ? caller.slice(1) : caller;
  const usable = input.bindings.filter((binding) => binding.status === "ACTIVE" || binding.status === "AWAITING_READBACK");
  const owned = usable.filter((binding) => binding.clientId === appId);
  const pool = owned.length ? owned : usable.filter((binding) => {
    const did = binding.did.replace(/\D/g, "");
    const tail = did.length === 11 && did.startsWith("1") ? did.slice(1) : did;
    return Boolean(callerTail) && tail.slice(-10) === callerTail.slice(-10);
  });
  if (pool.length !== 1) return { ok: false as const, reason: pool.length > 1 ? "ambiguous" as const : "unknown" as const };
  const binding = pool[0];
  const bound = binding.did.replace(/\D/g, "");
  const boundTail = bound.length === 11 && bound.startsWith("1") ? bound.slice(1) : bound;
  if (callerTail && boundTail && callerTail.slice(-10) !== boundTail.slice(-10)) return { ok: false as const, reason: "did" as const };
  return { ok: true as const, binding };
}

export function liveCallDecision(input: {
  resolved: boolean;
  paused: boolean;
  masterOn: boolean;
  receptionistOn: boolean;
  suspended: boolean;
  customerEnabled: boolean;
  protocol: RealtimeProtocol;
  fallback: string;
}) {
  const placeCall = false as const;
  if (!input.masterOn || !input.receptionistOn) {
    return { answer: false as const, placeCall, transfer: input.fallback, outcome: "ai_switch_off" };
  }
  if (input.suspended || !input.customerEnabled || input.paused || !input.resolved) {
    return { answer: false as const, placeCall, transfer: input.fallback, outcome: input.resolved ? "fallback" : "unknown_tenant" };
  }
  if (input.protocol === "gemini" || input.protocol === "qwen") {
    return { answer: false as const, placeCall, transfer: input.fallback, outcome: "realtime_protocol_not_connected" };
  }
  if (!input.protocol) return { answer: false as const, placeCall, transfer: input.fallback, outcome: "no_realtime_engine" };
  return { answer: true as const, placeCall, transfer: "", outcome: "answer" };
}

export function describeStoredConnection(input: { enabled: boolean; hasAddress: boolean; hasClientId: boolean; hasSecret: boolean }) {
  const ready = input.enabled && input.hasAddress && input.hasClientId && input.hasSecret;
  return {
    ready,
    reused: [
      "The saved 3CX connection (address, Client ID, and secret)",
      "The XAPI client that already creates trunks, departments, extensions, and inbound routes",
      "Customer ring groups, DIDs, and extension numbers",
      "AI receptionist prompts, published versions, knowledge, voice, and transfer allowlists",
    ],
    missing: ready
      ? ""
      : "This server's 3CX connection record is empty or turned off. Call control reads that same record. A new PBX, trunk, or secret is not part of this step.",
  };
}

export function classifyCallControlProbe(input: {
  connectionReady: boolean;
  tokenStatus: number;
  callControlStatus: number;
  version: string;
  xapiMessage: string;
  protocol: RealtimeProtocol;
  engineName: string;
}) {
  if (!input.connectionReady) {
    return {
      callControl: "unverified" as CapabilityStatus,
      programmable: "unverified" as CapabilityStatus,
      version: "",
      evidence: "Existing 3CX connection settings are not available on this server.",
      missing: describeStoredConnection({ enabled: false, hasAddress: false, hasClientId: false, hasSecret: false }).missing,
      liveAudioReady: false,
    };
  }
  const version = input.version.trim();
  if (input.tokenStatus !== 200) {
    return {
      callControl: "unverified" as CapabilityStatus,
      programmable: "unverified" as CapabilityStatus,
      version,
      evidence: `The existing Service Principal was not accepted at token request (${input.tokenStatus || "no response"}). ${input.xapiMessage}`.trim(),
      missing: "The saved 3CX Client ID was rejected. Check that same principal. Do not create a new PBX.",
      liveAudioReady: false,
    };
  }
  if (input.callControlStatus !== 200) {
    const refused = input.callControlStatus === 401 || input.callControlStatus === 403;
    return {
      callControl: refused ? "unsupported" as CapabilityStatus : "unverified" as CapabilityStatus,
      programmable: refused ? "unsupported" as CapabilityStatus : "unverified" as CapabilityStatus,
      version,
      evidence: `Token succeeded with the existing principal. GET /callcontrol returned ${input.callControlStatus || "no response"}. ${version ? `PBX version header ${version}.` : "No version header."} ${input.xapiMessage}`.trim(),
      missing: refused
        ? "On the existing Service Principal, enable 3CX Call Control API access. A new PBX, trunk, desk phone, or softphone is not required."
        : `GET /callcontrol returned ${input.callControlStatus || "no response"} for the existing principal.`,
      liveAudioReady: false,
    };
  }
  const audioMissing = input.protocol === ""
    ? "Call Control accepted the existing principal. No enabled realtime voice engine is stored. Add that model on the existing AI engine record. Do not send the key in chat."
    : input.protocol === "gemini" || input.protocol === "qwen"
      ? `Call Control accepted the existing principal. ${input.engineName || "The stored engine"} uses ${input.protocol}, and that audio protocol is not connected yet. OpenAI Realtime and xAI are the connected protocols.`
      : "";
  return {
    callControl: "supported_verified" as CapabilityStatus,
    programmable: "supported_verified" as CapabilityStatus,
    version,
    evidence: `GET /callcontrol returned 200 for the existing Service Principal.${version ? ` Version ${version}.` : " Version header was absent."} ${input.xapiMessage}`.trim(),
    missing: audioMissing,
    liveAudioReady: input.protocol === "openai" || input.protocol === "xai",
  };
}

export type RealtimeEvent =
  | { type: "audio"; pcm24k: Buffer; id: string }
  | { type: "speech_started" }
  | { type: "response_started"; id: string }
  | { type: "response_finished"; id: string }
  | { type: "session_updated" }
  | { type: "provider_error"; message: string }
  | { type: "tool"; name: string; arguments: string; callId: string }
  | { type: "ignore" };

function responseId(event: Record<string, unknown>) {
  if (typeof event.response_id === "string") return event.response_id;
  const response = event.response;
  if (response && typeof response === "object" && typeof (response as { id?: unknown }).id === "string") return (response as { id: string }).id;
  return "";
}

export function openingLine(greeting: string) {
  const line = greeting.replace(/\s+/g, " ").trim().slice(0, 300);
  return line || "Thank you for calling. How can I help you today?";
}

export function greetingResponse(greeting: string) {
  return {
    type: "response.create" as const,
    response: {
      tool_choice: "none" as const,
      instructions: `Say exactly this one sentence, then stop and wait: ${openingLine(greeting)}`,
    },
  };
}

export type TalkState = { active: string; greetingOpen: boolean; dropped: string[]; holding: boolean };

export function freshTalk(): TalkState {
  return { active: "", greetingOpen: true, dropped: [], holding: false };
}

export function stepTalk(state: TalkState, event: { type: "response_started"; id: string } | { type: "response_finished"; id: string } | { type: "audio"; id: string } | { type: "caller_spoke" } | { type: "transfer" } | { type: "greeting_timeout" }) {
  const idle = { play: false, cancel: "", forwardCaller: !state.greetingOpen && !state.holding, clearPlayback: false };
  if (event.type === "transfer") {
    return { state: { ...state, active: "", greetingOpen: false, holding: true }, ...idle, cancel: state.active, forwardCaller: false, clearPlayback: true };
  }
  if (state.holding) return { state, ...idle, forwardCaller: false };
  if (event.type === "greeting_timeout") {
    if (!state.greetingOpen) return { state, ...idle };
    return { state: { ...state, active: "", greetingOpen: false }, ...idle, forwardCaller: true };
  }
  if (event.type === "response_started") {
    const id = event.id || "current";
    if (id === state.active) return { state, ...idle };
    if (!state.active) return { state: { ...state, active: id }, ...idle };
    return { state: { ...state, dropped: state.dropped.includes(id) ? state.dropped : [...state.dropped, id] }, ...idle, cancel: id };
  }
  if (event.type === "audio") {
    const id = event.id || state.active;
    return { state, ...idle, play: Boolean(state.active) && (id === state.active || state.active === "current") && !state.dropped.includes(id) };
  }
  if (event.type === "response_finished") {
    if (event.id && state.dropped.includes(event.id)) return { state, ...idle };
    if (!state.greetingOpen && !state.active) return { state, ...idle };
    const sameTurn = !event.id || !state.active || event.id === state.active || state.active === "current";
    if (!sameTurn) return { state, ...idle };
    if (!event.id && !state.active) return { state, ...idle };
    return { state: { ...state, active: "", greetingOpen: false }, ...idle, forwardCaller: true };
  }
  if (state.greetingOpen) return { state, ...idle, forwardCaller: false };
  return { state: { ...state, active: "" }, ...idle, forwardCaller: true, cancel: state.active, clearPlayback: Boolean(state.active) };
}

export type ProviderSetup = { greeted: boolean; retried: boolean };

export function freshProviderSetup(): ProviderSetup {
  return { greeted: false, retried: false };
}

export function providerSetupAction(state: ProviderSetup, event: "session_updated" | "timeout" | "error") {
  if (state.greeted) return { state, action: "wait" as const };
  if (event === "error" && !state.retried) return { state: { ...state, retried: true }, action: "retry" as const };
  return { state: { ...state, greeted: true }, action: "greet" as const };
}

export function followUpResponse() {
  return {
    type: "response.create" as const,
    response: {
      tool_choice: "none" as const,
      instructions: "Answer the caller in one or two sentences. Do not repeat the greeting.",
    },
  };
}

export function readRealtimeEvent(event: Record<string, unknown>): RealtimeEvent {
  const type = String(event.type || "");
  if (type === "input_audio_buffer.speech_started" || type === "conversation.item.input_audio_buffer.speech_started") {
    return { type: "speech_started" };
  }
  if (type === "session.updated") return { type: "session_updated" };
  if (type === "error") {
    const error = event.error && typeof event.error === "object" ? event.error as { message?: unknown } : {};
    const message = typeof error.message === "string" ? error.message : typeof event.message === "string" ? event.message : "";
    return { type: "provider_error", message: message.replace(/\s+/g, " ").trim().slice(0, 300) };
  }
  if (type === "response.created") return { type: "response_started", id: responseId(event) };
  if (type === "response.done" || type === "response.cancelled" || type === "response.audio.done" || type === "response.output_audio.done") {
    return { type: "response_finished", id: responseId(event) };
  }
  if (type === "response.audio.delta" || type === "response.output_audio.delta") {
    const delta = String(event.delta || "");
    if (!delta) return { type: "ignore" };
    return { type: "audio", pcm24k: Buffer.from(delta, "base64"), id: responseId(event) };
  }
  if (type === "response.function_call_arguments.done") {
    return { type: "tool", name: String(event.name || ""), arguments: String(event.arguments || ""), callId: String(event.call_id || "") };
  }
  const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : null;
  if (type === "response.output_item.done" && item?.type === "function_call") {
    return { type: "tool", name: String(item.name || ""), arguments: String(item.arguments || ""), callId: String(item.call_id || "") };
  }
  return { type: "ignore" };
}

export function realtimeSocketUrl(protocol: "openai" | "xai", model: string) {
  const chosen = model.trim() || (protocol === "xai" ? "grok-voice" : "gpt-realtime");
  if (protocol === "xai") return `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(chosen)}`;
  return `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(chosen)}`;
}

export function realtimeSessionUpdate(input: { instructions: string; voice: string; transfers: readonly (string | TransferChoice)[]; protocol?: "openai" | "xai"; plain?: boolean }) {
  const transfers = input.plain ? [] : transferChoices(input.transfers).map((item) => item.number).slice(0, 40);
  const destination = transfers.length
    ? { type: "string", enum: transfers }
    : { type: "string" };
  const instructions = `${input.instructions}\n\nAfter the greeting, answer the caller. When the caller asks for a person, department, or extension, call transfer_to_approved_destination immediately, then stop speaking.`;
  const tools = [
    {
      type: "function",
      name: "transfer_to_approved_destination",
      description: "Transfer the caller now. destination is the extension number from the approved list. Call this only when the caller asks for a person, department, or extension.",
      parameters: { type: "object", properties: { destination }, required: ["destination"] },
    },
    {
      type: "function",
      name: "end_call",
      description: "End the call after the caller is finished.",
      parameters: { type: "object", properties: {} },
    },
  ];
  if (input.protocol === "xai") {
    return {
      type: "session.update",
      session: {
        voice: input.voice,
        instructions,
        turn_detection: { type: "server_vad" },
        audio: {
          input: { format: { type: "audio/pcm", rate: 24000 }, turn_detection: { type: "server_vad" } },
          output: { format: { type: "audio/pcm", rate: 24000 } },
        },
        tools,
      },
    };
  }
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions,
      audio: {
        input: { format: { type: "audio/pcm", rate: 24000 }, turn_detection: { type: "server_vad" } },
        output: { format: { type: "audio/pcm", rate: 24000 }, voice: input.voice },
      },
      tools,
    },
  };
}
