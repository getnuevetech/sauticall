export type GrantBucket = {
  id: number;
  kind: "plan" | "bundle";
  secondsLeft: number;
  periodStart: string;
  periodEnd: string;
};

export type FreshCall = { uniqueid: string; seconds: number; startedAt: string };

export type Slice = { uniqueid: string; grantId: number; seconds: number };

export function addDays(startIso: string, days: number) {
  const date = new Date(startIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export type CdrCall = { uniqueid: string; seconds: number; destination: string; startedAt: string };

function clock(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (match) return `${match[1]}T${match[2]}.000Z`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function secondsOf(row: Record<string, unknown>) {
  const seconds = Number(row.seconds);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);
  const duration = String(row.duration || "");
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  const asNumber = Number(duration);
  return Number.isFinite(asNumber) && asNumber >= 0 ? Math.round(asNumber) : 0;
}

export function readOutboundCalls(body: unknown): CdrCall[] {
  if (!body || typeof body !== "object") return [];
  const list = (body as { cdr?: unknown }).cdr;
  if (!Array.isArray(list)) return [];
  const calls: CdrCall[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const description = `${row.description || ""} ${row.calltype || ""} ${row.type || ""}`.toLowerCase();
    if (!description.includes("out") || description.includes("inbound")) continue;
    const uniqueid = String(row.uniqueid || row.unique_id || "");
    if (!uniqueid) continue;
    const seconds = secondsOf(row);
    if (seconds <= 0) continue;
    calls.push({
      uniqueid,
      seconds,
      destination: String(row.destination || row.number || "").slice(0, 40),
      startedAt: clock(String(row.date || row.datetime || "")),
    });
  }
  return calls;
}

export function allocateCall(grants: GrantBucket[], call: FreshCall): Slice[] {
  const active = grants.filter((grant) => grant.secondsLeft > 0 && grant.periodStart <= call.startedAt && call.startedAt < grant.periodEnd);
  const ordered = [
    ...active.filter((grant) => grant.kind === "plan").sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.id - b.id),
    ...active.filter((grant) => grant.kind === "bundle").sort((a, b) => a.id - b.id),
  ];
  const slices: Slice[] = [];
  let left = Math.max(0, Math.round(call.seconds));
  for (const grant of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, grant.secondsLeft);
    if (take <= 0) continue;
    grant.secondsLeft -= take;
    left -= take;
    slices.push({ uniqueid: call.uniqueid, grantId: grant.id, seconds: take });
  }
  if (left > 0) slices.push({ uniqueid: call.uniqueid, grantId: 0, seconds: left });
  return slices;
}
