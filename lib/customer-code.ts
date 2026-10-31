export const CLIENT_MAIL_HOST = "sauticall.com";

export type CustomerKind = "individual" | "business";

export function kindFromPlan(plan: { seats?: number; custom?: boolean } | null | undefined): CustomerKind {
  if (!plan) return "individual";
  if (plan.custom) return "business";
  return Number(plan.seats) > 1 ? "business" : "individual";
}

export function formatCustomerCode(kind: CustomerKind, sequence: number) {
  const prefix = kind === "business" ? "B" : "I";
  const value = Math.max(1, Math.min(9_999_999, Math.floor(sequence)));
  return `${prefix}${String(value).padStart(7, "0")}`;
}

export function customerCodeWithoutHyphen(code: string) {
  const compact = code.trim().replace(/-/g, "");
  return /^[IB]\d{7}$/.test(compact) ? compact : code.trim();
}

export function nextCustomerCode(kind: CustomerKind, existing: string[]) {
  const prefix = kind === "business" ? "B" : "I";
  let max = 0;
  for (const code of existing) {
    const compact = customerCodeWithoutHyphen(code);
    if (!compact.startsWith(prefix) || !/^[IB]\d{7}$/.test(compact)) continue;
    const value = Number(compact.slice(prefix.length));
    if (Number.isInteger(value) && value > max && value <= 9_999_999) max = value;
  }
  return formatCustomerCode(kind, max + 1);
}

export function clientMailbox(code: string) {
  const compact = customerCodeWithoutHyphen(code);
  if (!/^[IB]\d{7}$/.test(compact)) return "";
  return `${compact}@${CLIENT_MAIL_HOST}`;
}
