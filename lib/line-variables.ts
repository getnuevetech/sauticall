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
    key: "lock_international",
    label: "Block international calls",
    detail: "The VoIP.ms line template blocks international calls. A value here is not sent.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "international_route",
    label: "International route",
    detail: "The VoIP.ms line template uses the Value international route. A value here is not sent.",
    adminValue: "",
    audience: "admin",
    kind: "text",
  },
  {
    key: "music_on_hold",
    label: "Hold music",
    detail: "The VoIP.ms line template uses no hold music. A value here is not sent.",
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

export function lineOverride(base: string, override: string) {
  return override.trim() === "" ? base : override;
}

export function audienceLabel(audience: Audience) {
  if (audience === "both") return "Both · team value wins";
  if (audience === "customer") return "Customer";
  return "Team only";
}

export function variableValueLabel(variable: Pick<LineVariable, "key" | "kind" | "adminValue">) {
  const value = variable.adminValue.trim();
  if (variable.key === "lock_international") {
    if (value === "1") return "On";
    if (value === "0") return "Off";
    if (!value) return "Not set";
  }
  if (!value) return "Not set";
  if (variable.kind === "days") return `${value} ${value === "1" ? "day" : "days"}`;
  return value;
}

export function precedenceNote(variable: Pick<LineVariable, "key" | "audience">) {
  const billing = variable.key === "billing_days";
  const fallback = billing ? "A blank value uses the 30-day billing fallback." : "If it is not set, the phone-connection default is used.";
  if (variable.audience === "both") return `When a team value is set, it takes priority over a customer value. If it is not set, the customer value is used. ${fallback}`;
  if (variable.audience === "customer") return `A customer value is used when they set one. Otherwise the team value is used. ${fallback}`;
  return `Only the team can set this. ${fallback}`;
}

export function variableScope(key: string) {
  if (key === "billing_days") return "Used for the next billing date when a line account is created. Saving it does not change an account that already exists.";
  return "Sent when a new line account is created. Saving it does not change a line account that already exists.";
}

export function variableField(key: string) {
  if (key === "billing_days") return "reseller_nextbilling";
  return key;
}

export function variableUpdates(current: { key: string; adminValue: string; audience: string }[], fields: Record<string, string | undefined>) {
  return current.flatMap((item) => {
    const value = fields[`value_${item.key}`];
    const audience = fields[`audience_${item.key}`];
    if (value == null && audience == null) return [];
    return [{ key: item.key, adminValue: value ?? item.adminValue, audience: audience ?? item.audience }];
  });
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
