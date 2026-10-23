import { featureLabels, normalizePlan, planAllows, type FeatureKey } from "./plan-features.ts";
import { planSignupPath } from "./signup.ts";
import type { Plan } from "./types.ts";

export type SetupNeed = {
  people: number;
  ai: boolean;
  anyLanguage: boolean;
  porting: boolean;
  queues: boolean;
};

export function readSetupNeed(prompt: string): SetupNeed {
  const text = prompt.toLowerCase();
  const counted = text.match(/\b(\d+)\s*(?:people|persons|person|employees|employee|users|user|staff|extensions|extension|seats|agents|reps|team members)\b/)
    || text.match(/\b(?:team|office|staff) of (\d+)\b/);
  let people = counted ? Number(counted[1]) : 1;
  if (!counted && /\b(team|office|staff|employees)\b/.test(text)) people = 5;
  if (/\b(just me|only me|myself|solo|one person)\b/.test(text)) people = 1;
  const anyLanguage = /\b(any language|spanish|french|multilingual|bilingual|other languages)\b/.test(text);
  const ai = anyLanguage || /\b(ai|receptionist|assistant|answer calls|automatically answer)\b/.test(text);
  const porting = /\b(port|keep (my|our|the) number|transfer|existing number)\b/.test(text);
  const queues = /\b(queue|on hold|call center|contact center)\b/.test(text);
  return { people: Math.max(1, Math.min(500, people)), ai, anyLanguage, porting, queues };
}

export type SetupAdvice = {
  planName: string;
  custom: boolean;
  price: number;
  seats: number;
  minutes: number;
  features: string[];
  summary: string;
  href: string;
};

function covers(plan: Plan, need: SetupNeed) {
  const seats = Number(plan.seats) || 0;
  if (need.people > 1 && seats > 0 && seats < need.people) return false;
  if (need.people === 1 && seats > 0 && seats < 1) return false;
  if (seats > 0 && seats < need.people) return false;
  const required: FeatureKey[] = [];
  if (need.ai) required.push("ai");
  if (need.anyLanguage) required.push("ai_any_language");
  if (need.porting) required.push("porting");
  if (need.queues) required.push("queues");
  return required.every((key) => planAllows(plan, key));
}

export function recommendPlan(plans: Plan[], prompt: string): SetupAdvice | null {
  const catalog = plans.map((plan) => normalizePlan(plan));
  const priced = catalog.filter((plan) => !plan.custom && plan.price > 0);
  const need = readSetupNeed(prompt);
  const fits = priced.filter((plan) => covers(plan, need)).sort((a, b) => a.price - b.price);
  const chosen = fits[0];
  const custom = catalog.find((plan) => plan.custom);
  const plan = chosen || custom;
  if (!plan) return null;
  const why = [
    need.people > 1 ? `${need.people} people` : "1 person",
    need.ai ? "the AI receptionist" : "",
    need.anyLanguage ? "any language" : "",
    need.porting ? "number transfer" : "",
    need.queues ? "a call queue" : "",
  ].filter(Boolean);
  const asked = why.join(", ");
  const summary = plan.custom
    ? `No priced plan covers ${asked}. Custom is the request to send, and a salesperson follows up.`
    : `${plan.name} covers ${asked}. It is $${plan.price} per month for ${plan.seats} ${plan.seats === 1 ? "person" : "people"} and ${plan.includedMinutes} outbound minutes.`;
  return {
    planName: plan.name,
    custom: Boolean(plan.custom),
    price: plan.price,
    seats: Number(plan.seats) || 0,
    minutes: plan.includedMinutes,
    features: featureLabels(plan.features),
    summary,
    href: plan.custom ? `/custom?setup=${encodeURIComponent(prompt.trim().slice(0, 400))}` : planSignupPath(plan.name, prompt),
  };
}
