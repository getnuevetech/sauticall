import { recommendPlan, type SetupAdvice } from "./setup-assistant.ts";
import type { Plan } from "./types.ts";

export type Offering = {
  id: string;
  title: string;
  detail: string;
};

export const OFFERINGS: Offering[] = [
  { id: "phone", title: "Cloud business phone system", detail: "A business number, extensions, and voicemail." },
  { id: "desk", title: "Desk phones and softphones", detail: "Office phones plus the mobile and desktop apps." },
  { id: "ai", title: "AI receptionist", detail: "The AI receptionist answers and routes calls." },
  { id: "center", title: "Virtual contact center", detail: "A call queue for a busy team." },
  { id: "numbers", title: "Business numbers and porting", detail: "A new number, or keep the current one." },
];

export function offeringById(id: string) {
  return OFFERINGS.find((item) => item.id === id);
}

export function offeringForService(service: { title: string; icon: string }) {
  const text = `${service.icon} ${service.title}`.toLowerCase();
  if (text.includes("receptionist") || service.icon === "bot") return offeringById("ai");
  if (text.includes("contact") || text.includes("queue") || text.includes("center") || service.icon === "headset") return offeringById("center");
  if (text.includes("port") || text.includes("number") || service.icon === "globe") return offeringById("numbers");
  if (text.includes("desk") || text.includes("softphone") || service.icon === "smartphone") return offeringById("desk");
  if (text.includes("guided") || text.includes("setup") || service.icon === "spark") return undefined;
  return offeringById("phone");
}

export function selectionPrompt(query: { product?: string; people?: string; language?: string; ai?: string; setup?: string }) {
  const people = Number(query.people || 0);
  const count = people > 0 ? people : query.product === "center" ? 10 : query.product === "desk" ? 5 : query.product ? 1 : 0;
  const bits: string[] = [];
  if (count) bits.push(`${count} ${count === 1 ? "person" : "people"}`);
  if (query.product === "phone" || query.product === "ai") bits.push("a business number");
  if (query.product === "desk") bits.push("desk phones");
  if (query.product === "numbers") bits.push("keep our number");
  if (query.product === "center") bits.push("a call queue");
  if (query.product === "ai" || query.ai === "1" || query.language === "1") bits.push("an AI receptionist");
  if (query.language === "1") bits.push("any language");
  const note = String(query.setup || "").trim();
  if (note) bits.push(note);
  return bits.join(", ").slice(0, 400);
}

export function selectionAdvice(plans: Plan[], query: { product?: string; people?: string; language?: string; ai?: string; setup?: string }): SetupAdvice | null {
  const prompt = selectionPrompt(query);
  if (!prompt) return null;
  return recommendPlan(plans, prompt);
}
