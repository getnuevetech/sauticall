import type { Plan } from "./types";

export const PLAN_FEATURES = [
  { key: "numbers", group: "Phone", label: "Business numbers", detail: "The customer can request a new number." },
  { key: "porting", group: "Phone", label: "Number transfer", detail: "The customer can bring an existing number." },
  { key: "softphone", group: "Phone", label: "Softphones", detail: "The account includes the mobile and desktop phone apps." },
  { key: "desk_phones", group: "Phone", label: "Desk phones", detail: "The account includes office phone setup." },
  { key: "voicemail", group: "Phone", label: "Voicemail and forwarding", detail: "The account includes voicemail and call forwarding." },
  { key: "business_hours", group: "Phone", label: "Business hours", detail: "The customer can set open and closed hours." },
  { key: "ring_groups", group: "Phone", label: "Ring groups", detail: "The customer can ring several people together." },
  { key: "queues", group: "Phone", label: "Call queues", detail: "The customer can hold callers in a queue." },
  { key: "ai", group: "AI", label: "AI receptionist", detail: "The account includes the AI receptionist." },
  { key: "ai_any_language", group: "AI", label: "AI in any language", detail: "The AI understands callers in any language. This also includes the AI receptionist." },
  { key: "reporting", group: "Team", label: "Call reporting", detail: "The account includes call reporting." },
] as const;

export type FeatureKey = (typeof PLAN_FEATURES)[number]["key"];

const FEATURE_SET = new Set<string>(PLAN_FEATURES.map((feature) => feature.key));

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_SET.has(value);
}

export function featureLabel(key: string) {
  return PLAN_FEATURES.find((feature) => feature.key === key)?.label || key;
}

export function featureLabels(keys: string[]) {
  const selected = new Set(keys);
  return PLAN_FEATURES.filter((feature) => selected.has(feature.key)).map((feature) => feature.label);
}

function keyed(features: string[]) {
  return features.every((feature) => FEATURE_SET.has(feature));
}

function seatsFrom(plan: Plan) {
  if (typeof plan.seats === "number" && plan.seats >= 0 && keyed(plan.features || [])) return Math.round(plan.seats);
  if (plan.custom && !(Number(plan.seats) > 0)) return Math.max(0, Math.round(Number(plan.seats) || 0));
  if (plan.base) return 1;
  const match = String(plan.units || "").match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function directKeys(plan: Plan) {
  const features = plan.features || [];
  if (keyed(features)) return features.filter(isFeatureKey);
  const text = features.join("\n").toLowerCase();
  const keys = new Set<FeatureKey>();
  if (text.includes("number request") || text.includes("business number")) keys.add("numbers");
  if (text.includes("port") || text.includes("transfer") || text.includes("keep your")) keys.add("porting");
  if (text.includes("softphone")) keys.add("softphone");
  if (text.includes("desk phone") || text.includes("desk-phone")) keys.add("desk_phones");
  if (text.includes("voicemail") || text.includes("forward")) keys.add("voicemail");
  if (text.includes("business-hour") || text.includes("business hour")) keys.add("business_hours");
  if (text.includes("ring group")) keys.add("ring_groups");
  if (text.includes("queue")) keys.add("queues");
  if (text.includes("report")) keys.add("reporting");
  if (plan.multilingual || text.includes("any language") || text.includes("any-language")) {
    keys.add("ai");
    keys.add("ai_any_language");
  } else if (text.includes("ai ")) keys.add("ai");
  return [...keys];
}

export function extensionCapacity(plan: { seats?: number; base?: boolean; units?: string } | null | undefined) {
  if (!plan) return 1;
  const seats = Number(plan.seats);
  if (Number.isFinite(seats) && seats > 0) return Math.round(seats);
  if (plan.base) return 1;
  const match = String(plan.units || "").match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

export function normalizePlans(plans: Plan[]) {
  const byName = new Map<string, FeatureKey[]>();
  return plans.map((plan) => {
    const own = directKeys(plan);
    const inherited: FeatureKey[] = [];
    if (!keyed(plan.features || [])) {
      for (const feature of plan.features || []) {
        const match = /^everything in (.+)$/i.exec(feature.trim());
        const parent = match ? byName.get(match[1].trim().toLowerCase()) : undefined;
        if (parent) inherited.push(...parent);
      }
    }
    const features = [...new Set<FeatureKey>([...inherited, ...own])];
    if (features.includes("ai_any_language") && !features.includes("ai")) features.push("ai");
    byName.set(plan.name.trim().toLowerCase(), features);
    const seats = seatsFrom(plan);
    const custom = Boolean(plan.custom);
    return {
      ...plan,
      custom,
      seats,
      features,
      multilingual: features.includes("ai_any_language"),
      base: false,
      includedMinutes: Math.max(0, Math.round(Number(plan.includedMinutes) || 0)),
      price: custom ? 0 : Math.max(0, Number(plan.price) || 0),
      priceLabel: custom ? plan.priceLabel || "Custom" : plan.priceLabel || "",
      units: custom && seats === 0 ? plan.units || "Scoped with you" : `${seats} ${seats === 1 ? "person" : "people"}`,
    };
  });
}

export function normalizePlan(plan: Plan) {
  return normalizePlans([plan])[0];
}

export function planAllows(plan: Plan | null | undefined, key: FeatureKey) {
  if (!plan) return false;
  const features = new Set(normalizePlan(plan).features);
  if (key === "ai" && features.has("ai_any_language")) return true;
  return features.has(key);
}
