export const FAILURE_OPERATIONS = [
  { value: "", label: "All operations" },
  { value: "number", label: "Number buy" },
  { value: "extension", label: "Extension" },
  { value: "group", label: "Ring group or queue" },
  { value: "payment", label: "Payment" },
  { value: "trunk", label: "Trunk setup" },
  { value: "transfer", label: "Number transfer" },
  { value: "emergency", label: "Emergency address" },
  { value: "minutes", label: "Call minutes" },
  { value: "client", label: "Phone-company client" },
  { value: "connection", label: "Connection check" },
  { value: "email", label: "Email" },
] as const;

export const FAILURE_PROVIDERS = [
  { value: "", label: "All providers" },
  { value: "3CX", label: "3CX" },
  { value: "VoIP.ms", label: "VoIP.ms" },
  { value: "Payments", label: "Payments" },
  { value: "Mail", label: "Mail" },
  { value: "Connection", label: "Connection" },
] as const;

export function operationLabel(area: string) {
  return FAILURE_OPERATIONS.find((item) => item.value === area)?.label || area || "Request";
}

export function providerFor(area: string) {
  if (area === "trunk" || area === "extension" || area === "group") return "3CX";
  if (area === "payment") return "Payments";
  if (area === "email") return "Mail";
  if (area === "connection") return "Connection";
  return "VoIP.ms";
}

export function workflowHref(area: string, userId: number) {
  if (area === "trunk" || area === "emergency" || area === "minutes") return userId ? `/admin/lines?company=${userId}` : "/admin/lines";
  if (area === "number" || area === "transfer") return "/admin/requests";
  if (area === "extension" || area === "group") return userId ? `/admin/phone?company=${userId}` : "/admin/phone";
  if (area === "payment") return "/admin/gateways";
  if (area === "connection") return "/admin/connections";
  return userId ? `/admin/customers/${userId}` : "/admin/customers";
}

export function workflowLabel(area: string) {
  if (area === "trunk") return "Open trunk workflow";
  if (area === "number" || area === "transfer") return "Open number workflow";
  if (area === "extension" || area === "group") return "Open phone workflow";
  if (area === "payment") return "Open payments";
  return "Open the workflow";
}

export type FailureFact = { status: string; code: string; cause: string };

export function failureFacts(detail: string): FailureFact {
  const text = detail.trim();
  const status = text.match(/\b([1-5]\d{2})\b/)?.[1] || "";
  const quoted = text.match(/"error"\s*:\s*"([^"]+)"/i)?.[1] || text.match(/"code"\s*:\s*"([^"]+)"/i)?.[1] || "";
  const snake = text.match(/\b([a-z][a-z0-9]+(?:_[a-z0-9]+)+)\b/)?.[1] || "";
  const code = (quoted || snake).slice(0, 80);
  const cause = text
    .replace(/\s+/g, " ")
    .replace(/^\{.*\}$/, "The provider returned a technical response.")
    .slice(0, 180);
  return { status, code, cause: cause || "The request was rejected." };
}

export type FailureAttempt = {
  id: number;
  area: string;
  userId: number;
  subject: string;
  detail: string;
  createdAt: string;
};

export type FailureGroup = {
  key: string;
  area: string;
  userId: number;
  subject: string;
  attempts: FailureAttempt[];
  latest: FailureAttempt;
};

export function groupFailures(rows: FailureAttempt[]) {
  const groups = new Map<string, FailureAttempt[]>();
  for (const row of rows) {
    const key = `${row.userId}|${row.area}|${row.subject}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const result: FailureGroup[] = [];
  for (const [key, attempts] of groups) {
    const ordered = [...attempts].sort((a, b) => a.id - b.id);
    const latest = ordered[ordered.length - 1];
    result.push({ key, area: latest.area, userId: latest.userId, subject: latest.subject, attempts: ordered, latest });
  }
  result.sort((a, b) => b.latest.id - a.latest.id);
  return result;
}

export function withinDays(iso: string, days: number, now: number) {
  if (!days) return true;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return false;
  return now - then <= days * 24 * 60 * 60 * 1000;
}

export function ago(iso: string, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }).format(new Date(then));
}
