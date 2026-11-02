export type RouteBinding = {
  tenantId: number;
  clientId: string;
  did: string;
  status: string;
  agentId: number;
  promptVersionId: number;
};

export type KnowledgeChunk = { tenantId: number; body: string };

const LIVE_BLOCKER = "Live answering is blocked. 3CX has not confirmed a programmable route that can carry audio. Calls stay on the ring group.";

export function resolveInbound(input: { bindings: RouteBinding[]; clientId: string; did: string }) {
  const clientId = input.clientId.trim();
  const matches = input.bindings.filter((binding) => binding.clientId === clientId && binding.status === "ACTIVE");
  if (matches.length !== 1) return { ok: false as const, state: "FALLBACK" as const, reason: matches.length > 1 ? "ambiguous" : "unknown" };
  const binding = matches[0];
  const did = input.did.replace(/\D/g, "");
  const owned = binding.did.replace(/\D/g, "");
  if (did && owned && did.slice(-10) !== owned.slice(-10)) return { ok: false as const, state: "FALLBACK" as const, reason: "did" };
  return { ok: true as const, binding };
}

export function openCallSession(input: {
  binding: RouteBinding | null;
  paused: boolean;
  callControlVerified: boolean;
  pbxCallId: string;
}) {
  if (!input.callControlVerified || !input.pbxCallId.trim()) {
    return { state: "FALLBACK" as const, mediaOpen: false, placeCall: false, promptVersionId: input.binding?.promptVersionId || 0, reason: LIVE_BLOCKER };
  }
  if (!input.binding || input.paused) {
    return { state: "FALLBACK" as const, mediaOpen: false, placeCall: false, promptVersionId: 0, reason: "This receptionist is paused or has no certified route. Calls stay on the backup destination." };
  }
  return { state: "GREETING" as const, mediaOpen: false, placeCall: false, promptVersionId: input.binding.promptVersionId, reason: "" };
}

export function retrieveKnowledge(input: { tenantId: number; chunks: KnowledgeChunk[]; question: string; summary: string }) {
  const own = input.chunks.filter((chunk) => chunk.tenantId === input.tenantId);
  const question = input.question.toLowerCase();
  if (/what does (this|the) company do|what do you do/.test(question) && input.summary.trim()) {
    return { answer: input.summary.trim(), source: "approved summary" };
  }
  const hit = own.find((chunk) => question.split(/\W+/).filter((word) => word.length > 3).some((word) => chunk.body.toLowerCase().includes(word)));
  if (hit) return { answer: hit.body, source: "approved knowledge" };
  return { answer: "I do not have that information. I can take a message or offer an approved person.", source: "" };
}

export function previewConversation(input: {
  tenantId: number;
  chunks: KnowledgeChunk[];
  summary: string;
  utterance: string;
  allowedTransfers: readonly string[];
}) {
  const utterance = input.utterance.trim();
  const transfer = utterance.match(/transfer(?: to)?\s+([A-Za-z0-9_-]+)/i);
  if (transfer) {
    const destination = transfer[1];
    const allowed = input.allowedTransfers.includes(destination);
    return {
      mediaOpen: false,
      placeCall: false,
      transfer: allowed ? destination : "",
      text: allowed ? `I can connect you to ${destination}.` : "That transfer is not approved for this account.",
    };
  }
  const found = retrieveKnowledge({ tenantId: input.tenantId, chunks: input.chunks, question: utterance, summary: input.summary });
  return { mediaOpen: false, placeCall: false, transfer: "", text: found.answer };
}

export function notificationDecision(input: { outboundVerified: boolean; consent: boolean; suppressed: boolean; digit: string }) {
  if (!input.outboundVerified) return { dial: false as const, outcome: "NOT_ENABLED", reason: "Outbound calling through 3CX is not verified. No call is placed." };
  if (!input.consent || input.suppressed) return { dial: false as const, outcome: "blocked", reason: "This recipient is not eligible." };
  if (input.digit === "9") return { dial: false as const, outcome: "opt_out", reason: "Opt-out recorded. No message is played." };
  if (input.digit === "2") return { dial: false as const, outcome: "declined", reason: "Declined. No message is played." };
  if (input.digit === "1") return { dial: false as const, outcome: "accepted", reason: "The approved message can play only after 3CX originates the call." };
  return { dial: false as const, outcome: "no_input", reason: "No choice was recorded. The call ends without assuming acceptance." };
}

export function activePromptVersion(input: { publishedId: number; pinnedId: number; rollbackId: number }) {
  if (input.rollbackId > 0) return input.rollbackId;
  return input.pinnedId > 0 ? input.pinnedId : input.publishedId;
}

export function livePromptAllowed(bindingStatus: string) {
  return bindingStatus === "ACTIVE";
}
