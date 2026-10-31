import crypto from "crypto";

export const AI_ENGINE_KINDS = ["tts", "stt", "llm"] as const;

export const AI_SWITCHES = [
  { code: "master", label: "Master AI", detail: "Stops new AI sessions. Ordinary phone calls keep working." },
  { code: "notifications", label: "Automated notifications", detail: "Stops new notification calls without turning off the other AI services." },
  { code: "receptionist", label: "AI receptionist", detail: "Answers inbound calls from approved company knowledge." },
  { code: "personal_assistant", label: "Personal assistant", detail: "Screens calls using the rules the owner saved." },
  { code: "outbound_assistant", label: "Outbound assistant", detail: "Task-limited two-way calls to people who already agreed." },
  { code: "setup_assistant", label: "Setup assistant", detail: "Drafts a phone-system proposal for a person to approve." },
] as const;

export const AI_FUNCTIONS = [
  { code: "tts", label: "Text to voice", detail: "Turns an approved script into audio SautiCall stores." },
  { code: "stt", label: "Speech to text", detail: "Optional yes, no, and stop. The keypad still works." },
  { code: "notifications", label: "Automated notifications", detail: "Plays the stored prompt and message." },
  { code: "receptionist", label: "AI receptionist", detail: "Speaks with inbound callers." },
  { code: "personal_assistant", label: "Personal assistant", detail: "Screens the owner's calls." },
  { code: "outbound_assistant", label: "Outbound assistant", detail: "Runs the outbound conversation." },
  { code: "setup_assistant", label: "Setup assistant", detail: "Drafts a phone-system proposal." },
] as const;

export type AiEngineKind = (typeof AI_ENGINE_KINDS)[number];
export type AiSwitchCode = (typeof AI_SWITCHES)[number]["code"];
export type AiFunctionCode = (typeof AI_FUNCTIONS)[number]["code"];

export type AiEngineDraft = {
  name: string;
  kind: string;
  model: string;
  endpoint: string;
  secretRef: string;
  enabled: boolean;
};

export type AiEngineRecord = AiEngineDraft & { id: number; hasSecret: boolean };

const SWITCH_CODES = new Set<string>(AI_SWITCHES.map((item) => item.code));
const FUNCTION_CODES = new Set<string>(AI_FUNCTIONS.map((item) => item.code));

export function knownSwitch(code: string): code is AiSwitchCode {
  return SWITCH_CODES.has(code);
}

export function knownFunction(code: string): code is AiFunctionCode {
  return FUNCTION_CODES.has(code);
}

export function featureReady(enabled: ReadonlySet<string>, feature: AiSwitchCode) {
  if (feature === "master") return enabled.has("master");
  return enabled.has("master") && enabled.has(feature);
}

export function customerAiState(input: { master: boolean; feature: boolean; planIncludes: boolean }) {
  if (!input.master || !input.feature) return { code: "off" as const, label: "Turned off by SautiCall" };
  if (!input.planIncludes) return { code: "not_on_plan" as const, label: "Not on this plan" };
  return { code: "included" as const, label: "Included on this plan" };
}

export function jobKind(functionCode: string): AiEngineKind {
  if (functionCode === "tts") return "tts";
  if (functionCode === "stt") return "stt";
  return "llm";
}

export function validateEngineKey(key: string) {
  const clean = key.trim();
  if (clean.length > 300) return { ok: false as const, message: "That API key is too long." };
  if (/\s/.test(clean)) return { ok: false as const, message: "The API key cannot contain spaces." };
  return { ok: true as const, key: clean };
}

export function validateEngine(input: AiEngineDraft): { ok: true; engine: AiEngineDraft } | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 80);
  const model = input.model.trim().slice(0, 120);
  const endpoint = input.endpoint.trim().slice(0, 300);
  const secretRef = input.secretRef.trim().slice(0, 80);
  if (!name) return { ok: false, message: "Enter a name for this engine." };
  if (!AI_ENGINE_KINDS.includes(input.kind as AiEngineKind)) return { ok: false, message: "Choose text to voice, speech to text, or a language model." };
  if (!model) return { ok: false, message: "Enter the model name from that service." };
  if (endpoint && !/^https:\/\/[^\s]+$/i.test(endpoint)) return { ok: false, message: "The engine address must start with https://, or stay blank until the service is ready." };
  if (secretRef && !/^[A-Za-z0-9][A-Za-z0-9._-]*[:/][A-Za-z0-9._:/-]+$/.test(secretRef)) return { ok: false, message: "Use a vault name such as vault:ai-voice. Do not paste the secret itself." };
  if (input.enabled && !endpoint) return { ok: false, message: "Add an https address before turning this engine on." };
  return { ok: true, engine: { name, kind: input.kind, model, endpoint, secretRef, enabled: input.enabled } };
}

export const AI_PLAN_FEATURE: Record<Exclude<AiSwitchCode, "master">, "ai" | "ai_notifications" | "ai_assistant" | "ai_outbound" | "ai_setup"> = {
  notifications: "ai_notifications",
  receptionist: "ai",
  personal_assistant: "ai_assistant",
  outbound_assistant: "ai_outbound",
  setup_assistant: "ai_setup",
};

export const NOTIFICATION_ACKS = [
  { code: "authority", label: "I am allowed to turn this on for this account." },
  { code: "permission", label: "I am responsible for having permission from every person this account calls." },
  { code: "identity", label: "The business name and the message will be truthful." },
  { code: "optout", label: "I will honor stop requests and remove people who opt out." },
  { code: "charges", label: "I accept the usage charges and limits on this account." },
] as const;

export type AiGrant = "none" | "requested" | "granted" | "suspended";

export function agreementDigest(title: string, body: string) {
  return crypto.createHash("sha256").update(`${title.trim()}\n${body.trim()}`).digest("hex");
}

export function nextAgreementVersion(current: { version: number; digest: string } | null, title: string, body: string) {
  const digest = agreementDigest(title, body);
  if (current && current.digest === digest) return { version: current.version, digest, changed: false };
  return { version: (current?.version || 0) + 1, digest, changed: true };
}

export function acceptanceComplete(codes: string[]) {
  return NOTIFICATION_ACKS.every((item) => codes.includes(item.code));
}

export const DRAFT_NOTIFICATION_AGREEMENT = {
  title: "Automated calling agreement",
  body: "This draft must be replaced after legal review before production calling. Accepting it does not give permission from the people who will be called. You are responsible for calling only people your business is allowed to call, for a truthful business name and message, and for honoring a request to stop. SautiCall can refuse or stop calls. Usage can create charges under the plan on this account.",
};

export function activationState(input: {
  globalOn: boolean;
  planIncludes: boolean;
  publishedVersion: number;
  acceptedVersion: number;
  grant: AiGrant;
  customerEnabled: boolean;
  reviewRequired: boolean;
}) {
  if (!input.globalOn) return { code: "off_global" as const, label: "Turned off by SautiCall" };
  if (!input.planIncludes) return { code: "not_in_plan" as const, label: "Not on this plan" };
  if (input.grant === "suspended") return { code: "suspended" as const, label: "Suspended by SautiCall" };
  if (input.reviewRequired && input.publishedVersion < 1) return { code: "pending_terms" as const, label: "Terms are not published yet" };
  if (input.publishedVersion > 0 && input.acceptedVersion < input.publishedVersion) return { code: "pending_terms" as const, label: "Accept the current terms" };
  if (input.reviewRequired && input.grant === "requested") return { code: "pending_review" as const, label: "Waiting for review" };
  if (input.reviewRequired && input.grant !== "granted") return { code: "ready_to_request" as const, label: "Ask SautiCall to turn this on" };
  if (!input.customerEnabled) return { code: "paused" as const, label: "Off. You can turn it on." };
  return { code: "active" as const, label: "On" };
}

export function validateAssignment(functionCode: string, engineId: number, engines: AiEngineRecord[]) {
  if (!knownFunction(functionCode)) return { ok: false as const, message: "That job is not part of the AI system." };
  const engine = engines.find((item) => item.id === engineId);
  if (!engine) return { ok: false as const, message: "Choose an engine that is saved on this system." };
  if (!engine.enabled) return { ok: false as const, message: `${engine.name} is off. Turn it on before assigning it.` };
  if (engine.kind !== jobKind(functionCode)) return { ok: false as const, message: `${engine.name} does not do this job. Choose an engine of the matching kind.` };
  return { ok: true as const, functionCode, engineId };
}
