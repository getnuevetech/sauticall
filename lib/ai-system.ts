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

export type AiEngineRecord = AiEngineDraft & { id: number };

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

export function validateEngine(input: AiEngineDraft): { ok: true; engine: AiEngineDraft } | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 80);
  const model = input.model.trim().slice(0, 120);
  const endpoint = input.endpoint.trim().slice(0, 200);
  const secretRef = input.secretRef.trim().slice(0, 80);
  if (!name) return { ok: false, message: "Enter a name for this engine." };
  if (!AI_ENGINE_KINDS.includes(input.kind as AiEngineKind)) return { ok: false, message: "Choose text to voice, speech to text, or a language model." };
  if (!model) return { ok: false, message: "Enter the model name." };
  if (endpoint && !/^https:\/\/[^\s]+$/i.test(endpoint)) return { ok: false, message: "The engine address must start with https://, or stay blank until the service is ready." };
  if (secretRef && !/^[A-Za-z0-9][A-Za-z0-9._-]*[:/][A-Za-z0-9._:/-]+$/.test(secretRef)) return { ok: false, message: "Use a vault name such as vault:ai-voice. Do not paste the secret itself." };
  if (input.enabled && !endpoint) return { ok: false, message: "Add an https address before turning this engine on." };
  return { ok: true, engine: { name, kind: input.kind, model, endpoint, secretRef, enabled: input.enabled } };
}

export function validateAssignment(functionCode: string, engineId: number, engines: AiEngineRecord[]) {
  if (!knownFunction(functionCode)) return { ok: false as const, message: "That job is not part of the AI system." };
  const engine = engines.find((item) => item.id === engineId);
  if (!engine) return { ok: false as const, message: "Choose an engine that is saved on this system." };
  if (!engine.enabled) return { ok: false as const, message: `${engine.name} is off. Turn it on before assigning it.` };
  return { ok: true as const, functionCode, engineId };
}
