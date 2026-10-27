export type Audience = "admin" | "customer" | "both";
export type VariableKind = "days" | "text";

export type LineVariable = {
  key: string;
  label: string;
  detail: string;
  adminValue: string;
  audience: Audience;
  kind: VariableKind;
};

export const LINE_VARIABLES: LineVariable[] = [
  {
    key: "billing_days",
    label: "Days until the next bill",
    detail: "Added to the day the customer paid. That date is sent as the phone company’s next billing date. When both sides can set this, a number saved here is the one that is used.",
    adminValue: "30",
    audience: "admin",
    kind: "days",
  },
  {
    key: "allowed_codecs",
    label: "Codecs",
    detail: "Sent when a line account is created. ulaw, g729, gsm, or all. A value here replaces the codecs saved on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "device_type",
    label: "Phone type code",
    detail: "Sent when a line account is created. A value here replaces the phone type on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "lock_international",
    label: "Block international calls",
    detail: "1 blocks international calls on a new line account. 0 allows them. A value here replaces the switch on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "international_route",
    label: "International route",
    detail: "1 is the value route. 2 is premium. A value here replaces the route on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "music_on_hold",
    label: "Hold music",
    detail: "Sent when a line account is created. A value here replaces the hold music on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "dtmf_mode",
    label: "DTMF",
    detail: "Sent when a line account is created. A value here replaces the DTMF mode on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "nat",
    label: "NAT",
    detail: "Sent when a line account is created. A value here replaces the NAT setting on Phone connections.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
];

export function audienceOf(value: string): Audience {
  if (value === "customer" || value === "both") return value;
  return "admin";
}

export function resolveVariable(variable: Pick<LineVariable, "adminValue" | "audience">, customerValue: string) {
  const admin = variable.adminValue.trim();
  const customer = customerValue.trim();
  if (variable.audience === "customer") return customer || admin;
  if (variable.audience === "both") return admin || customer;
  return admin;
}

export function customerCanEdit(variable: Pick<LineVariable, "adminValue" | "audience">) {
  if (variable.audience === "customer") return true;
  return variable.audience === "both" && !variable.adminValue.trim();
}

export function billingDays(value: string, fallback = 30) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) return fallback;
  return days;
}

export function chicagoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function chicagoDay(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
}

export function addDays(day: string, days: number) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, (month || 1) - 1, date || 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function calendarLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function nextBillingDate(paidAt: string, daysValue: string, today = chicagoToday()) {
  const span = billingDays(daysValue);
  const paid = chicagoDay(paidAt);
  let cursor = addDays(paid || today, span);
  for (let step = 0; step < 48 && cursor <= today; step += 1) cursor = addDays(cursor, span);
  if (cursor <= today) return addDays(today, 1);
  return cursor;
}
