import type { FeatureKey } from "./plan-features";

export const ACCOUNT_AI_SYSTEMS = [
  { code: "receptionist", feature: "ai", label: "AI receptionist", detail: "Answers inbound callers for this account." },
  { code: "personal_assistant", feature: "ai_assistant", label: "Personal assistant", detail: "Screens calls for the person this extension belongs to." },
  { code: "outbound_assistant", feature: "ai_outbound", label: "Outbound assistant", detail: "Handles a task-limited outbound conversation." },
  { code: "setup_assistant", feature: "ai_setup", label: "Setup assistant", detail: "Drafts a phone-system proposal for review." },
  { code: "notifications", feature: "ai_notifications", label: "Automated notifications", detail: "Plays an approved message after the recipient presses 1." },
  { code: "tts", feature: "ai_voice", label: "Text to voice", detail: "Stores spoken audio from an approved script." },
  { code: "stt", feature: "ai_speech", label: "Speech to text", detail: "Listens for yes, no, and stop. The keypad still works." },
] as const;

export type AccountAiCode = (typeof ACCOUNT_AI_SYSTEMS)[number]["code"];

const CODES = new Set<string>(ACCOUNT_AI_SYSTEMS.map((item) => item.code));

export function knownAccountAi(code: string): code is AccountAiCode {
  return CODES.has(code);
}

export function accountAiFeature(code: string): FeatureKey | "" {
  return ACCOUNT_AI_SYSTEMS.find((item) => item.code === code)?.feature || "";
}

export function systemsForPlan(features: readonly string[]) {
  const selected = new Set(features);
  return ACCOUNT_AI_SYSTEMS.map((item) => ({ ...item, included: selected.has(item.feature) }));
}

export function validateAiExtension(input: { role: string; name: string; allowed: readonly string[] }) {
  const role = input.role.trim();
  if (!role) return { ok: true as const, role: "", name: "" };
  if (!knownAccountAi(role) || !input.allowed.includes(role)) return { ok: false as const, message: "That AI system is not included on this plan." };
  const name = input.name.trim().slice(0, 40);
  if (!name) return { ok: false as const, message: "Name this AI extension." };
  return { ok: true as const, role, name };
}

export function validateAiGreeting(value: string) {
  const greeting = value.trim().slice(0, 1500);
  return { ok: true as const, greeting };
}

export function aiConnectionStatus(input: { included: boolean; named: boolean; extensionNumber: string; onPhoneSystem: boolean }) {
  if (!input.included) {
    return { configured: "Not on this plan", phone: "No AI extension", live: "Off" };
  }
  return {
    configured: input.named ? "Configured" : "Needs a name",
    phone: input.extensionNumber
      ? input.onPhoneSystem
        ? `Extension ${input.extensionNumber} is on the phone system`
        : `Extension ${input.extensionNumber} is saved here. It is not on the phone system yet.`
      : "No extension assigned",
    live: "Off. This account does not answer or place a call from this page.",
  };
}
