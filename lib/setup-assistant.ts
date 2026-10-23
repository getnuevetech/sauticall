import { featureLabels, normalizePlan, planAllows, type FeatureKey } from "./plan-features.ts";
import { planSignupPath } from "./signup.ts";
import type { Plan } from "./types.ts";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const NUMBER_WORD = Object.keys(NUMBER_WORDS).join("|");
const PLACE_SKIP = new Set(["local", "new", "business", "toll", "existing", "our", "my", "the", "a", "an", "phone", "virtual", "free", "main", "another", "this", "that", "your", "one"]);

export type SetupNeed = {
  people: number;
  ai: boolean;
  anyLanguage: boolean;
  porting: boolean;
  queues: boolean;
  place: string;
  localNumber: boolean;
  routing: string;
  deskPhones: boolean;
};

function titleWord(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function peopleCount(text: string) {
  const digit = text.match(new RegExp(`\\b(\\d+)\\s*(?:people|persons|person|employees|employee|users|user|staff|extensions|extension|seats|agents|reps|team members)\\b`))
    || text.match(/\b(?:team|office|staff) of (\d+)\b/);
  if (digit) return Number(digit[1]);
  const word = text.match(new RegExp(`\\b(?:team|office|staff) of (${NUMBER_WORD})\\b`))
    || text.match(new RegExp(`\\b(${NUMBER_WORD})\\s*(?:people|persons|person|employees|employee|users|user|staff|extensions|extension|seats|agents|reps|team members)\\b`));
  if (word) return NUMBER_WORDS[word[1]];
  if (/\b(just me|only me|myself|solo|one person)\b/.test(text)) return 1;
  if (/\b(team|office|staff|employees)\b/.test(text)) return 5;
  return 1;
}

function placeName(text: string) {
  const match = text.match(/\b([a-z]{3,}(?:\s+[a-z]{3,})?)\s+numbers?\b/);
  if (!match || PLACE_SKIP.has(match[1])) return "";
  return titleWord(match[1]);
}

function routingPoint(text: string) {
  const dept = text.match(/\b(sales|support|billing|service)\b/);
  const aimed = text.match(/\b(?:transfer(?:red)?|rout(?:e|ed|ing)|forward(?:ed)?|send)\b(?:\s+[a-z]+){0,4}?\s+to\s+(?:my |our |the )?([a-z]+(?:\s+[a-z]+){0,3})/);
  const who = aimed?.[1]?.replace(/\b(please|thanks|and|then)\b.*$/, "").trim() || "";
  if (dept && (who === "manager" || who === "owner" || (!who && /\b(manager|owner)\b/.test(text)))) return `${titleWord(dept[1])} call routing`;
  if (dept && who) return `${titleWord(dept[1])} calls to the ${who}`;
  if (who) return `Calls to the ${who}`;
  if (/\bring groups?\b/.test(text)) return "Ring group";
  return "";
}

export function readSetupNeed(prompt: string): SetupNeed {
  const text = prompt.toLowerCase();
  const place = placeName(text);
  const anyLanguage = /\b(any language|spanish|french|multilingual|bilingual|other languages)\b/.test(text);
  const ai = anyLanguage || /\b(ai|receptionist|assistant|answer calls|automatically answer)\b/.test(text);
  const porting = /\bport(?:ing|ed)?\b/.test(text) || /\bkeep (?:my|our|the) (?:current |existing )?number\b/.test(text) || /\bexisting number\b/.test(text) || /\btransfer (?:my|our|the) number\b/.test(text);
  const queues = /\b(queue|on hold|call center|contact center)\b/.test(text);
  const localNumber = Boolean(place) || /\b(?:local|new|business|toll-free|toll free)\s+numbers?\b/.test(text) || /\ba numbers?\b/.test(text);
  const deskPhones = /\bdesk phones?\b/.test(text);
  return {
    people: Math.max(1, Math.min(500, peopleCount(text))),
    ai,
    anyLanguage,
    porting,
    queues,
    place,
    localNumber,
    routing: routingPoint(text),
    deskPhones,
  };
}

export function setupPoints(need: SetupNeed) {
  const points: string[] = [];
  if (need.porting) points.push("Keep the current number");
  else if (need.place) points.push(`${need.place} number`);
  else if (need.localNumber) points.push("Local number request");
  points.push(need.people === 1 ? "1 extension" : `${need.people} extensions`);
  if (need.ai) points.push(need.anyLanguage ? "AI receptionist, any language" : "AI receptionist");
  if (need.routing) points.push(need.routing);
  if (need.queues) points.push("Call queue");
  if (need.deskPhones) points.push("Desk phones");
  return points;
}

export type SetupAdvice = {
  planName: string;
  custom: boolean;
  price: number;
  seats: number;
  minutes: number;
  features: string[];
  points: string[];
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
  if (need.deskPhones) required.push("desk_phones");
  return required.every((key) => planAllows(plan, key));
}

export function recommendPlan(plans: Plan[], prompt: string): SetupAdvice | null {
  const catalog = plans.map((plan) => normalizePlan(plan));
  const priced = catalog.filter((plan) => !plan.custom && plan.price > 0);
  const need = readSetupNeed(prompt);
  const points = setupPoints(need);
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
    points,
    summary,
    href: plan.custom ? `/custom?setup=${encodeURIComponent(prompt.trim().slice(0, 400))}` : planSignupPath(plan.name, prompt),
  };
}
