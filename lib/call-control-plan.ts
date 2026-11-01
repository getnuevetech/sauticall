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

const OPENAI_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);

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

export function spokenVoice(label: string) {
  const voice = label.trim().toLowerCase();
  return OPENAI_VOICES.has(voice) ? voice : "alloy";
}

export function fallbackExtension(label: string) {
  const match = label.match(/(\d{2,6})\s*$/);
  return match?.[1] || "";
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
  | { type: "audio"; pcm24k: Buffer }
  | { type: "speech_started" }
  | { type: "tool"; name: string; arguments: string; callId: string }
  | { type: "ignore" };

export function readRealtimeEvent(event: Record<string, unknown>): RealtimeEvent {
  const type = String(event.type || "");
  if (type === "input_audio_buffer.speech_started" || type === "conversation.item.input_audio_buffer.speech_started") {
    return { type: "speech_started" };
  }
  if (type === "response.audio.delta" || type === "response.output_audio.delta") {
    const delta = String(event.delta || "");
    if (!delta) return { type: "ignore" };
    return { type: "audio", pcm24k: Buffer.from(delta, "base64") };
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

export function realtimeSessionUpdate(input: { instructions: string; voice: string; transfers: string[] }) {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: input.instructions,
      audio: {
        input: { format: { type: "audio/pcm", rate: 24000 }, turn_detection: { type: "server_vad" } },
        output: { format: { type: "audio/pcm", rate: 24000 }, voice: input.voice },
      },
      tools: [
        {
          type: "function",
          name: "transfer_to_approved_destination",
          description: `Transfer only to one of these extensions: ${input.transfers.join(", ") || "none"}.`,
          parameters: { type: "object", properties: { destination: { type: "string" } }, required: ["destination"] },
        },
        {
          type: "function",
          name: "end_call",
          description: "End the call after the caller is finished.",
          parameters: { type: "object", properties: {} },
        },
      ],
    },
  };
}
