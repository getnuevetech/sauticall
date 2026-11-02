import { speakingDirections } from "./ai-choices.ts";
import { authorizeTool, ensureVirtualSchema } from "./ai-virtual.ts";
import { getConnection, test3cx } from "./carriers.ts";
import {
  classifyCallControlProbe,
  describeStoredConnection,
  fallbackExtension,
  fallbackVoice,
  followUpResponse,
  freshProviderSetup,
  freshTalk,
  greetingResponse,
  liveCallDecision,
  pbxOrigin,
  mediaWasOpen,
  providerSetupAction,
  readRealtimeEvent,
  realtimeSessionUpdate,
  realtimeSocketUrl,
  resolveProgrammableCall,
  selectRealtimeEngine,
  spokenVoice,
  stepTalk,
  transferAttempts,
  transferCanRetry,
  transferChoice,
  transferChoices,
  transferDestination,
  transferFailureLine,
  transferFailureText,
  unavailableSpeech,
  type TransferChoice,
  type RealtimeProtocol,
} from "./call-control-plan.ts";
import { getDb } from "./db.ts";
import { explainConfigurationCheck } from "./pbx-access.ts";
import { listAiEngines, readAiEngineSecret } from "./ai-store.ts";
import { noteCapability, recordLiveSession } from "./ai-virtual.ts";
import { downsample24kTo8k, upsample8kTo24k } from "./pcm-rate.ts";
import type { RouteBinding } from "./ai-platform.ts";
import WebSocket from "ws";

type Listener = { stop: () => void; startedAt: string };
const runtime = globalThis as { sauticallCallControl?: Listener };

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
    servicePrincipalId: connection.public.client_id || "",
    xapi: explainConfigurationCheck(connection.last_message),
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
    return new URL(pbxOrigin(address)).host;
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
    const origin = pbxOrigin(connection.public.base_url);
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
    pbxBase: pbxOrigin(connection.public.base_url),
    appId: connection.public.client_id,
    appSecret: connection.secret,
    websocket: { maxReconnects: 5, reconnectDelayMs: 2000 },
  });
  const calls = new Map<number, { stop: () => void }>();
  client.on("participantConnected", (participant) => {
    if (calls.has(participant.id)) return;
    const entry: { stop: () => void } = { stop: () => undefined };
    calls.set(participant.id, entry);
    void handleParticipant(participant, connection.public.client_id, (stop) => {
      entry.stop = stop;
    }).catch((error) => {
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
    }).finally(() => {
      if (calls.get(participant.id) === entry) calls.delete(participant.id);
    });
  });
  client.on("participantDisconnected", (participantId: number) => {
    calls.get(participantId)?.stop();
    calls.delete(participantId);
  });
  await client.connect();
  runtime.sauticallCallControl = {
    startedAt: now,
    stop: () => {
      for (const call of calls.values()) call.stop();
      calls.clear();
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
  getAudioWriter: () => { write: (chunk: Buffer) => void; clear: () => void; cancel?: () => void };
  cancelStreamQueue?: () => Promise<void>;
  transfer: (destination: string) => Promise<void>;
  drop: () => Promise<void>;
};

async function handleParticipant(participant: ParticipantLike, appId: string, registerStop: (stop: () => void) => void) {
  const startedAt = new Date().toISOString();
  const callerDid = String(participant.info.party_did || participant.info.party_caller_id || "");
  const resolved = resolveProgrammableCall({ bindings: bindings(), appId, callerDid, callControlVerified: true });
  ensureVirtualSchema(getDb());
  const agent = resolved.ok
    ? getDb().prepare("SELECT id, user_id, status, greeting, instructions, business_summary, voice_label, voice_gender, language, after_hours, allowed_transfers, fallback_label, published_version_id, agent_type FROM ai_agents WHERE id = ?").get(resolved.binding.agentId) as {
      id: number;
      user_id: number;
      status: string;
      greeting: string;
      instructions: string;
      business_summary: string;
      voice_label: string;
      voice_gender: string;
      language: string;
      after_hours: string;
      allowed_transfers: string;
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
  const allowed = transferAllowlist(agent.user_id, agent.allowed_transfers);
  const directory = allowed.map((item) => item.label ? `${item.number} ${item.label}` : item.number).join(", ");
  const knowledge = getDb().prepare(
    "SELECT c.body FROM ai_knowledge_chunks c JOIN ai_knowledge_sources s ON s.id = c.source_id WHERE s.user_id = ? AND s.agent_id = ?",
  ).all(agent.user_id, agent.id) as { body: string }[];
  const publication = getDb().prepare("SELECT compiled FROM ai_prompt_publications WHERE user_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 1").get(agent.user_id, agent.id) as { compiled: string } | undefined;
  const instructions = [
    publication?.compiled || agent.instructions,
    "Say the opening sentence once, then wait. Do not repeat the greeting and do not start a second welcome.",
    `APPROVED KNOWLEDGE:\n${knowledge.map((item) => item.body).join("\n").slice(0, 6000) || agent.business_summary}`,
    speakingDirections({ voiceLabel: agent.voice_label, gender: agent.voice_gender, language: agent.language, afterHours: agent.after_hours }),
    `Approved extensions: ${directory || "none"}. When the caller names one, call transfer_to_approved_destination with that extension number.`,
    "If the transfer result says the person is not available, tell the caller and offer a message, another approved person, or ending the call.",
    "Do not place an outbound call. Transfer only through the approved tool.",
  ].join("\n\n");
  const counts = { bytesIn: 0, bytesOut: 0, outcome: "connected" };
  const stream = await participant.getAudioStream();
  const writer = participant.getAudioWriter();
  let handoff: Promise<void> = Promise.resolve();
  const secret = readAiEngineSecret(realtime.id);
  const socket = await openProviderSocket({
    protocol: realtime.protocol,
    model: realtime.model,
    secret,
    instructions,
    voice: spokenVoice(agent.voice_label, agent.voice_gender, realtime.protocol),
    greeting: agent.greeting,
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
      const destination = transferDestination(args, allowed);
      const allowedTool = authorizeTool({
        tool: "transfer_to_approved_destination",
        sessionTenantId: agent.user_id,
        argumentTenantId: agent.user_id,
        destination,
        allowedDestinations: allowed.map((item) => item.number),
      });
      if (!allowedTool.allowed) return allowedTool.reason;
      const choice = transferChoice(destination, allowed);
      counts.outcome = `transferring ${choice.number}`;
      const pending = releaseAndTransfer(participant, writer, choice, counts);
      handoff = pending.then(() => undefined);
      const moved = await pending;
      if (moved.ok) return `Transferred to ${choice.number}. Say nothing else.`;
      const who = choice.label || `extension ${choice.number}`;
      return `NOT_AVAILABLE ${transferFailureLine(moved.failure, who)}`;
    },
  });
  registerStop(() => socket.stop());
  stream.on("data", (chunk: Buffer) => {
    counts.bytesIn += chunk.length;
    socket.sendPcm(chunk);
  });
  await new Promise<void>((resolve) => {
    stream.on("end", resolve);
    stream.on("close", resolve);
    stream.on("error", resolve);
  });
  await handoff;
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

function transferAllowlist(userId: number, saved: string): TransferChoice[] {
  const extensions = getDb().prepare(
    "SELECT number, first_name, last_name FROM pbx_extensions WHERE user_id = ? AND status != 'removed' AND ai_role != 'receptionist' AND number != ''",
  ).all(userId) as { number: string; first_name: string; last_name: string }[];
  const groups = getDb().prepare(
    "SELECT number, name, kind FROM call_groups WHERE user_id = ? AND number != '' AND status != 'removed'",
  ).all(userId) as { number: string; name: string; kind: string }[];
  const all = transferChoices([
    ...extensions.map((row) => ({ number: row.number, label: `${row.first_name} ${row.last_name}`.trim(), kind: "extension" as const })),
    ...groups.map((row) => ({ number: row.number, label: row.name.trim(), kind: row.kind === "queue" ? "queue" as const : "ring" as const })),
  ]);
  const picked = saved.split(",").map((item) => item.trim()).filter(Boolean);
  const chosen = picked.length ? all.filter((item) => picked.includes(item.number)) : all;
  return chosen.length ? chosen : all;
}

async function releaseAndTransfer(participant: ParticipantLike, writer: { clear: () => void; cancel?: () => void }, choice: TransferChoice, counts: { outcome: string }) {
  writer.clear();
  const attempts = transferAttempts(choice);
  let failure = "";
  let sent = choice.number;
  for (let index = 0; index < attempts.length; index += 1) {
    const destination = attempts[index];
    if (index > 0 && !transferCanRetry(failure, attempts[index - 1], destination)) break;
    sent = destination;
    try {
      await transferCaller(participant, destination);
      counts.outcome = `transferred ${choice.number}`;
      writer.cancel?.();
      return { ok: true, failure: "" };
    } catch (error) {
      failure = transferFailureText(error);
    }
  }
  counts.outcome = `transfer failed ${choice.number} as ${sent}: ${failure}`;
  return { ok: false, failure };
}

async function transferCaller(participant: ParticipantLike, destination: string) {
  const control = participant as ParticipantLike & {
    _controlParticipant?: (id: number, method: string, body: { destination: string; timeout: number }) => Promise<void>;
  };
  if (control._controlParticipant) {
    await control._controlParticipant(participant.id, "transferto", { destination, timeout: 25 });
    return;
  }
  await participant.transfer(destination);
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
  greeting: string;
  transfers: readonly (string | TransferChoice)[];
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
    let talk = freshTalk();
    let setup = freshProviderSetup();
    let setupTimer: ReturnType<typeof setTimeout> | null = null;
    let greetingTimer: ReturnType<typeof setTimeout> | null = null;
    const sessionUpdate = (plain: boolean) => realtimeSessionUpdate({
      instructions: input.instructions,
      voice: plain ? fallbackVoice(input.protocol) : input.voice,
      transfers: input.transfers,
      protocol: input.protocol,
      plain,
    });
    const sendGreeting = () => {
      if (setupTimer) clearTimeout(setupTimer);
      setupTimer = null;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(greetingResponse(input.greeting)));
    };
    const armSetup = () => {
      if (setupTimer) clearTimeout(setupTimer);
      setupTimer = setTimeout(() => {
        const next = providerSetupAction(setup, "timeout");
        setup = next.state;
        if (next.action === "greet") sendGreeting();
      }, 2000);
    };
    const apply = (event: Parameters<typeof stepTalk>[1]) => {
      const next = stepTalk(talk, event);
      talk = next.state;
      if (next.cancel && next.cancel !== "current" && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response.cancel", response_id: next.cancel }));
      if (next.clearPlayback) input.onBargeIn();
      if (!talk.greetingOpen && greetingTimer) {
        clearTimeout(greetingTimer);
        greetingTimer = null;
      }
      return next;
    };
    socket.on("open", () => {
      clearTimeout(timer);
      socket.send(JSON.stringify(sessionUpdate(false)));
      armSetup();
      resolve({
        sendPcm: (pcm8k) => {
          if (socket.readyState !== WebSocket.OPEN || talk.greetingOpen || talk.holding) return;
          socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: upsample8kTo24k(pcm8k).toString("base64") }));
        },
        stop: () => {
          if (setupTimer) clearTimeout(setupTimer);
          if (greetingTimer) clearTimeout(greetingTimer);
          socket.close();
        },
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
      if (parsed.type === "session_updated" || parsed.type === "provider_error") {
        const next = providerSetupAction(setup, parsed.type === "session_updated" ? "session_updated" : "error");
        setup = next.state;
        if (next.action === "retry" && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(sessionUpdate(true)));
          armSetup();
        }
        if (next.action === "greet") sendGreeting();
        return;
      }
      if (parsed.type === "response_started" || parsed.type === "response_finished") apply(parsed);
      if (parsed.type === "audio" && apply({ type: "audio", id: parsed.id }).play) {
        input.onPcm(downsample24kTo8k(parsed.pcm24k));
        if (talk.greetingOpen && !greetingTimer) {
          greetingTimer = setTimeout(() => apply({ type: "greeting_timeout" }), 12000);
        }
      }
      if (parsed.type === "speech_started") apply({ type: "caller_spoke" });
      if (parsed.type === "tool" && parsed.name === "transfer_to_approved_destination" && transferDestination(parsed.arguments, input.transfers)) apply({ type: "transfer" });
      if (parsed.type === "tool") {
        void input.onTool(parsed.name, parsed.arguments).then((result) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const unavailable = result.startsWith("NOT_AVAILABLE ") ? result.slice("NOT_AVAILABLE ".length) : "";
          if (unavailable) apply({ type: "transfer_failed" });
          socket.send(JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: parsed.callId, output: result },
          }));
          if (unavailable) socket.send(JSON.stringify(unavailableSpeech(unavailable)));
          else if (!talk.holding && parsed.name !== "end_call") socket.send(JSON.stringify(followUpResponse()));
        });
      }
    });
    socket.on("error", () => {
      clearTimeout(timer);
      reject(new Error("The realtime voice provider rejected the connection."));
    });
  });
}

