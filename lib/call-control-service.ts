import { authorizeTool } from "./ai-virtual.ts";
import { getConnection, test3cx } from "./carriers.ts";
import {
  classifyCallControlProbe,
  describeStoredConnection,
  fallbackExtension,
  liveCallDecision,
  mediaWasOpen,
  readRealtimeEvent,
  realtimeSessionUpdate,
  realtimeSocketUrl,
  resolveProgrammableCall,
  selectRealtimeEngine,
  spokenVoice,
  type RealtimeProtocol,
} from "./call-control-plan.ts";
import { getDb } from "./db.ts";
import { listAiEngines, readAiEngineSecret } from "./ai-store.ts";
import { noteCapability, recordLiveSession } from "./ai-virtual.ts";
import { downsample24kTo8k, upsample8kTo24k } from "./pcm-rate.ts";
import type { RouteBinding } from "./ai-platform.ts";
import WebSocket from "ws";

type Listener = { stop: () => void; startedAt: string };
const runtime = globalThis as { sauticallCallControl?: Listener };

function originOf(address: string) {
  const url = new URL(address);
  if (url.protocol !== "https:") throw new Error("The 3CX address must use https.");
  return url.origin;
}

function bindings(): RouteBinding[] {
  return getDb().prepare(
    `SELECT b.user_id AS tenantId, b.client_id AS clientId, a.did AS did, b.binding_status AS status, a.id AS agentId, a.published_version_id AS promptVersionId
     FROM ai_3cx_bindings b JOIN ai_agents a ON a.id = b.agent_id`,
  ).all() as RouteBinding[];
}

function switchOn(code: string) {
  const row = getDb().prepare("SELECT enabled FROM ai_switches WHERE code = ?").get(code) as { enabled: number } | undefined;
  return row?.enabled === 1;
}

export function callControlReport() {
  const connection = getConnection("3cx");
  const stored = describeStoredConnection({
    enabled: connection.enabled === 1,
    hasAddress: Boolean(connection.public.base_url),
    hasClientId: Boolean(connection.public.client_id),
    hasSecret: connection.hasSecret,
  });
  const engines = listAiEngines();
  const realtime = selectRealtimeEngine(engines);
  const caps = getDb().prepare("SELECT capability, status, observed_build, evidence FROM pbx_capabilities WHERE capability IN ('call_control', 'programmable_extensions')").all() as {
    capability: string;
    status: string;
    observed_build: string;
    evidence: string;
  }[];
  const calls = getDb().prepare(
    "SELECT id, user_id, pbx_call_id, state, media_open, place_call, outcome, started_at, ended_at FROM ai_sessions WHERE pbx_call_id != '' ORDER BY id DESC LIMIT 10",
  ).all() as { id: number; user_id: number; pbx_call_id: string; state: string; media_open: number; place_call: number; outcome: string; started_at: string; ended_at: string }[];
  return {
    stored,
    host: connection.public.base_url ? safeHost(connection.public.base_url) : "",
    xapi: connection.last_message,
    realtime: realtime ? { name: realtime.name, protocol: realtime.protocol } : null,
    textEngines: engines.filter((engine) => engine.enabled).map((engine) => engine.name),
    capabilities: caps,
    listening: Boolean(runtime.sauticallCallControl),
    calls,
    switches: { master: switchOn("master"), receptionist: switchOn("receptionist") },
  };
}

function safeHost(address: string) {
  try {
    return new URL(address).host;
  } catch {
    return "";
  }
}

export async function probeExistingCallControl(now: string) {
  const connection = getConnection("3cx");
  const stored = describeStoredConnection({
    enabled: connection.enabled === 1,
    hasAddress: Boolean(connection.public.base_url),
    hasClientId: Boolean(connection.public.client_id),
    hasSecret: connection.hasSecret,
  });
  const realtime = selectRealtimeEngine(listAiEngines().map((engine) => ({ ...engine, id: engine.id })));
  if (!stored.ready) {
    writeProbe(classifyCallControlProbe({
      connectionReady: false,
      tokenStatus: 0,
      callControlStatus: 0,
      version: "",
      xapiMessage: "",
      protocol: realtime?.protocol || "",
      engineName: realtime?.name || "",
    }), now);
    return callControlReport();
  }
  let xapiMessage = "";
  try {
    xapiMessage = (await test3cx()).message;
  } catch (error) {
    xapiMessage = error instanceof Error ? error.message : "XAPI check failed.";
  }
  let tokenStatus = 0;
  let callControlStatus = 0;
  let version = "";
  try {
    const origin = originOf(connection.public.base_url);
    const tokenResponse = await fetch(`${origin}/connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: connection.public.client_id,
        client_secret: connection.secret,
        grant_type: "client_credentials",
        scope: "mcp xapi",
      }),
      signal: AbortSignal.timeout(8000),
    });
    tokenStatus = tokenResponse.status;
    const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
    if (tokenResponse.ok && token?.access_token) {
      const control = await fetch(`${origin}/callcontrol`, {
        headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      callControlStatus = control.status;
      version = control.headers.get("x-3cx-version") || "";
      await control.arrayBuffer().catch(() => null);
    }
  } catch (error) {
    xapiMessage = `${xapiMessage} ${error instanceof Error ? error.message : "Call Control could not be reached."}`.trim();
  }
  writeProbe(classifyCallControlProbe({
    connectionReady: true,
    tokenStatus,
    callControlStatus,
    version,
    xapiMessage,
    protocol: realtime?.protocol || "",
    engineName: realtime?.name || "",
  }), now);
  return callControlReport();
}

function writeProbe(result: ReturnType<typeof classifyCallControlProbe>, now: string) {
  const database = getDb();
  noteCapability(database, { capability: "call_control", status: result.callControl, build: result.version, evidence: result.evidence, now });
  noteCapability(database, { capability: "programmable_extensions", status: result.programmable, build: result.version, evidence: result.evidence, now });
  if (result.missing) {
    noteCapability(database, {
      capability: "call_control",
      status: result.callControl,
      build: result.version,
      evidence: `${result.evidence} Missing: ${result.missing}`.slice(0, 500),
      now,
    });
  }
}

function callControlVerified() {
  const row = getDb().prepare("SELECT status FROM pbx_capabilities WHERE capability = 'call_control'").get() as { status: string } | undefined;
  return row?.status === "supported_verified";
}

export async function startExistingCallControl(now: string) {
  if (runtime.sauticallCallControl) return { ok: true as const, message: "The existing 3CX connection is already listening." };
  if (!callControlVerified()) return { ok: false as const, message: "Run the Call Control check on the existing connection before listening for calls." };
  const connection = getConnection("3cx");
  const { CallControlClient } = await import("@3cx/call-control-sdk");
  const client = new CallControlClient({
    pbxBase: originOf(connection.public.base_url),
    appId: connection.public.client_id,
    appSecret: connection.secret,
    websocket: { maxReconnects: 5, reconnectDelayMs: 2000 },
  });
  client.on("participantConnected", (participant) => {
    void handleParticipant(participant, connection.public.client_id).catch((error) => {
      const message = error instanceof Error ? error.message : "The call handler failed.";
      recordLiveSession(getDb(), {
        userId: 0,
        agentId: 0,
        promptVersionId: 0,
        pbxCallId: String(participant.id),
        state: "FAILED",
        mediaOpen: false,
        outcome: message.slice(0, 300),
        startedAt: now,
        endedAt: new Date().toISOString(),
      });
    });
  });
  await client.connect();
  runtime.sauticallCallControl = {
    startedAt: now,
    stop: () => {
      client.disconnect();
      runtime.sauticallCallControl = undefined;
    },
  };
  return { ok: true as const, message: "Listening on the existing Service Principal. Dial its Client ID from a registered extension. This did not place a call." };
}

export function stopExistingCallControl() {
  runtime.sauticallCallControl?.stop();
  return { ok: true as const, message: "Stopped listening. No call was placed." };
}

type ParticipantLike = {
  id: number;
  info: { party_did?: string | null; party_caller_id?: string | null };
  getAudioStream: () => Promise<NodeJS.ReadableStream>;
  getAudioWriter: () => { write: (chunk: Buffer) => void; clear: () => void };
  transfer: (destination: string) => Promise<void>;
  drop: () => Promise<void>;
};

async function handleParticipant(participant: ParticipantLike, appId: string) {
  const startedAt = new Date().toISOString();
  const callerDid = String(participant.info.party_did || participant.info.party_caller_id || "");
  const resolved = resolveProgrammableCall({ bindings: bindings(), appId, callerDid, callControlVerified: true });
  const agent = resolved.ok
    ? getDb().prepare("SELECT id, user_id, status, greeting, instructions, business_summary, voice_label, fallback_label, published_version_id, agent_type FROM ai_agents WHERE id = ?").get(resolved.binding.agentId) as {
      id: number;
      user_id: number;
      status: string;
      greeting: string;
      instructions: string;
      business_summary: string;
      voice_label: string;
      fallback_label: string;
      published_version_id: number;
      agent_type: string;
    } | undefined
    : undefined;
  const entitlement = agent
    ? getDb().prepare("SELECT admin_grant, customer_enabled FROM ai_entitlements WHERE user_id = ? AND feature_code = ?").get(agent.user_id, agent.agent_type) as { admin_grant: string; customer_enabled: number } | undefined
    : undefined;
  const realtime = selectRealtimeEngine(listAiEngines().map((engine) => ({ ...engine, id: engine.id })));
  const fallback = agent ? fallbackExtension(agent.fallback_label) : "";
  const decision = liveCallDecision({
    resolved: Boolean(agent),
    paused: agent?.status === "PAUSED",
    masterOn: switchOn("master"),
    receptionistOn: switchOn("receptionist"),
    suspended: entitlement?.admin_grant === "suspended",
    customerEnabled: entitlement ? entitlement.customer_enabled === 1 : true,
    protocol: realtime?.protocol || "",
    fallback,
  });
  if (!decision.answer || !agent || !realtime || (realtime.protocol !== "openai" && realtime.protocol !== "xai")) {
    await finishWithoutAudio(participant, agent, decision.transfer, decision.outcome, startedAt);
    return;
  }
  const allowed = transferAllowlist(agent.user_id);
  const knowledge = getDb().prepare(
    "SELECT c.body FROM ai_knowledge_chunks c JOIN ai_knowledge_sources s ON s.id = c.source_id WHERE s.user_id = ? AND s.agent_id = ?",
  ).all(agent.user_id, agent.id) as { body: string }[];
  const publication = getDb().prepare("SELECT compiled FROM ai_prompt_publications WHERE user_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 1").get(agent.user_id, agent.id) as { compiled: string } | undefined;
  const instructions = [
    publication?.compiled || agent.instructions,
    `GREETING TO SPEAK FIRST: ${agent.greeting || "Thank you for calling. How can I help you today?"}`,
    `APPROVED KNOWLEDGE:\n${knowledge.map((item) => item.body).join("\n").slice(0, 6000) || agent.business_summary}`,
    "Do not place an outbound call. Transfer only through the approved tool.",
  ].join("\n\n");
  const counts = { bytesIn: 0, bytesOut: 0, outcome: "connected" };
  const stream = await participant.getAudioStream();
  const writer = participant.getAudioWriter();
  const secret = readAiEngineSecret(realtime.id);
  const socket = await openProviderSocket({
    protocol: realtime.protocol,
    model: realtime.model,
    secret,
    instructions,
    voice: spokenVoice(agent.voice_label),
    transfers: allowed,
    onPcm: (pcm8k) => {
      counts.bytesOut += pcm8k.length;
      writer.write(pcm8k);
    },
    onBargeIn: () => writer.clear(),
    onTool: async (name, args) => {
      if (name === "end_call") {
        counts.outcome = "ended";
        await participant.drop();
        return "Call ended.";
      }
      let destination = "";
      try {
        destination = String((JSON.parse(args) as { destination?: string }).destination || "");
      } catch {
        destination = "";
      }
      const allowedTool = authorizeTool({
        tool: "transfer_to_approved_destination",
        sessionTenantId: agent.user_id,
        argumentTenantId: agent.user_id,
        destination,
        allowedDestinations: allowed,
      });
      if (!allowedTool.allowed) return allowedTool.reason;
      await participant.transfer(destination);
      counts.outcome = `transferred ${destination}`;
      return `Transferred to ${destination}.`;
    },
  });
  stream.on("data", (chunk: Buffer) => {
    counts.bytesIn += chunk.length;
    socket.sendPcm(chunk);
  });
  await new Promise<void>((resolve) => {
    stream.on("end", resolve);
    stream.on("close", resolve);
    stream.on("error", resolve);
  });
  socket.stop();
  const sessionId = recordLiveSession(getDb(), {
    userId: agent.user_id,
    agentId: agent.id,
    promptVersionId: agent.published_version_id,
    pbxCallId: String(participant.id),
    state: "COMPLETED",
    mediaOpen: mediaWasOpen(counts.bytesIn, counts.bytesOut),
    outcome: `${counts.outcome}; bytes in ${counts.bytesIn}; bytes out ${counts.bytesOut}`,
    startedAt,
    endedAt: new Date().toISOString(),
  });
  if (counts.outcome.startsWith("transferred")) {
    getDb().prepare("INSERT INTO ai_tool_audit (session_id, user_id, tool, outcome, created_at) VALUES (?, ?, 'transfer_to_approved_destination', ?, ?)").run(sessionId, agent.user_id, counts.outcome, new Date().toISOString());
  }
}

function transferAllowlist(userId: number) {
  const extensions = getDb().prepare(
    "SELECT number FROM pbx_extensions WHERE user_id = ? AND status != 'removed' AND ai_role != 'receptionist' AND number != ''",
  ).all(userId) as { number: string }[];
  const groups = getDb().prepare("SELECT number FROM call_groups WHERE user_id = ? AND number != ''").all(userId) as { number: string }[];
  return [...extensions, ...groups].map((row) => row.number);
}

async function finishWithoutAudio(participant: ParticipantLike, agent: { id: number; user_id: number; published_version_id: number } | undefined, transfer: string, outcome: string, startedAt: string) {
  let finalOutcome = outcome;
  try {
    if (transfer) {
      await participant.transfer(transfer);
      finalOutcome = `${outcome}; transferred to fallback ${transfer}`;
    } else await participant.drop();
  } catch (error) {
    finalOutcome = `${outcome}; ${error instanceof Error ? error.message : "fallback failed"}`;
  }
  recordLiveSession(getDb(), {
    userId: agent?.user_id || 0,
    agentId: agent?.id || 0,
    promptVersionId: agent?.published_version_id || 0,
    pbxCallId: String(participant.id),
    state: "COMPLETED",
    mediaOpen: false,
    outcome: finalOutcome,
    startedAt,
    endedAt: new Date().toISOString(),
  });
}

function openProviderSocket(input: {
  protocol: "openai" | "xai";
  model: string;
  secret: string;
  instructions: string;
  voice: string;
  transfers: string[];
  onPcm: (pcm8k: Buffer) => void;
  onBargeIn: () => void;
  onTool: (name: string, args: string) => Promise<string>;
}) {
  return new Promise<{ sendPcm: (pcm8k: Buffer) => void; stop: () => void }>((resolve, reject) => {
    const socket = new WebSocket(realtimeSocketUrl(input.protocol, input.model), {
      headers: { authorization: `Bearer ${input.secret}` },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("The realtime voice provider did not connect."));
    }, 8000);
    socket.on("open", () => {
      clearTimeout(timer);
      socket.send(JSON.stringify(realtimeSessionUpdate({ instructions: input.instructions, voice: input.voice, transfers: input.transfers })));
      socket.send(JSON.stringify({
        type: "response.create",
        response: { tool_choice: "none", instructions: "Say the configured greeting and then wait.", input: [] },
      }));
      resolve({
        sendPcm: (pcm8k) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: upsample8kTo24k(pcm8k).toString("base64") }));
        },
        stop: () => socket.close(),
      });
    });
    socket.on("message", (data) => {
      const raw = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      let event: Record<string, unknown> = {};
      try {
        event = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      const parsed = readRealtimeEvent(event);
      if (parsed.type === "audio") input.onPcm(downsample24kTo8k(parsed.pcm24k));
      if (parsed.type === "speech_started") input.onBargeIn();
      if (parsed.type === "tool") {
        void input.onTool(parsed.name, parsed.arguments).then((result) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: parsed.callId, output: result },
          }));
        });
      }
    });
    socket.on("error", () => {
      clearTimeout(timer);
      reject(new Error("The realtime voice provider rejected the connection."));
    });
  });
}

