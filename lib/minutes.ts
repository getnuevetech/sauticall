import { flagOn, getDb, readDoc } from "./db";
import { addDays, allocateCall, type GrantBucket } from "./minute-math";
import type { Plan } from "./types";
import { fetchOutboundCalls, getSubaccount, markSynced, setOutboundLocked } from "./voip-account";

const BUNDLE_END = "9999-12-31T00:00:00.000Z";

type GrantRow = { id: number; user_id: number; kind: string; minutes: number; period_start: string; period_end: string };
type Attempt = { id: number; user_id: number; status: string; product_kind: string; product_minutes: number; paid_at: string; created_at: string };

export function grantForPayment(paymentId: number) {
  const attempt = getDb().prepare("SELECT id, user_id, status, product_kind, product_minutes, paid_at, created_at FROM payment_attempts WHERE id = ?").get(paymentId) as Attempt | undefined;
  if (!attempt || attempt.status !== "paid" || !attempt.user_id || attempt.product_minutes <= 0) return;
  const start = attempt.paid_at || attempt.created_at || new Date().toISOString();
  const kind = attempt.product_kind === "bundle" ? "bundle" : "plan";
  const end = kind === "bundle" ? BUNDLE_END : addDays(start, 30);
  getDb().prepare(
    `INSERT INTO minute_grants (user_id, payment_id, kind, minutes, period_start, period_end, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(payment_id) DO NOTHING`,
  ).run(attempt.user_id, attempt.id, kind, attempt.product_minutes, start, end, new Date().toISOString());
}

function grantsFor(userId: number) {
  return getDb().prepare("SELECT id, user_id, kind, minutes, period_start, period_end FROM minute_grants WHERE user_id = ? ORDER BY id").all(userId) as GrantRow[];
}

function usedByGrant(userId: number) {
  const rows = getDb().prepare("SELECT grant_id, SUM(seconds) AS seconds FROM minute_debits WHERE user_id = ? GROUP BY grant_id").all(userId) as { grant_id: number; seconds: number }[];
  return new Map(rows.map((row) => [row.grant_id, Number(row.seconds) || 0]));
}

export function minuteBalance(userId: number, now = new Date().toISOString()) {
  const used = usedByGrant(userId);
  let planSeconds = 0;
  let bundleSeconds = 0;
  for (const grant of grantsFor(userId)) {
    if (now < grant.period_start || now >= grant.period_end) continue;
    const left = Math.max(0, grant.minutes * 60 - (used.get(grant.id) || 0));
    if (grant.kind === "bundle") bundleSeconds += left;
    else planSeconds += left;
  }
  const usedRow = getDb().prepare("SELECT COALESCE(SUM(seconds), 0) AS seconds FROM cdr_events WHERE user_id = ?").get(userId) as { seconds: number };
  return {
    planMinutesLeft: Math.floor(planSeconds / 60),
    bundleMinutesLeft: Math.floor(bundleSeconds / 60),
    minutesLeft: Math.floor((planSeconds + bundleSeconds) / 60),
    totalSeconds: planSeconds + bundleSeconds,
    usedMinutes: Math.floor((Number(usedRow.seconds) || 0) / 60),
  };
}

function buckets(userId: number): GrantBucket[] {
  const used = usedByGrant(userId);
  return grantsFor(userId).map((grant) => ({
    id: grant.id,
    kind: grant.kind === "bundle" ? "bundle" : "plan",
    secondsLeft: Math.max(0, grant.minutes * 60 - (used.get(grant.id) || 0)),
    periodStart: grant.period_start,
    periodEnd: grant.period_end,
  }));
}

function storeCalls(userId: number, calls: { uniqueid: string; seconds: number; destination: string; startedAt: string }[]) {
  const database = getDb();
  const insert = database.prepare("INSERT INTO cdr_events (uniqueid, user_id, seconds, destination, started_at, allocated, created_at) VALUES (?, ?, ?, ?, ?, 0, ?) ON CONFLICT(uniqueid) DO NOTHING");
  const now = new Date().toISOString();
  for (const call of calls) insert.run(call.uniqueid, userId, call.seconds, call.destination, call.startedAt, now);
  const pending = database.prepare("SELECT uniqueid, seconds, started_at FROM cdr_events WHERE user_id = ? AND allocated = 0").all(userId) as { uniqueid: string; seconds: number; started_at: string }[];
  const debit = database.prepare("INSERT INTO minute_debits (uniqueid, user_id, grant_id, seconds) VALUES (?, ?, ?, ?)");
  const mark = database.prepare("UPDATE cdr_events SET allocated = 1 WHERE uniqueid = ?");
  const apply = database.transaction(() => {
    const open = buckets(userId);
    for (const call of pending) {
      for (const slice of allocateCall(open, { uniqueid: call.uniqueid, seconds: call.seconds, startedAt: call.started_at })) {
        debit.run(slice.uniqueid, userId, slice.grantId, slice.seconds);
      }
      mark.run(call.uniqueid);
    }
  });
  apply();
}

export async function syncUserMinutes(userId: number) {
  if (!flagOn("minutes.live_sync")) return { ok: false, message: "Reading call minutes from VoIP.ms is turned off." };
  const sub = getSubaccount(userId);
  if (!sub) return { ok: false, message: "This customer has no VoIP.ms line account yet." };
  const end = new Date();
  const start = new Date(end.getTime() - 31 * 24 * 60 * 60 * 1000);
  const history = await fetchOutboundCalls(sub.account, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  if (!history.ok) {
    markSynced(userId, history.message);
    const { recordFailure } = await import("./failure-log");
    recordFailure({ area: "minutes", userId, subject: sub.account, detail: history.message });
    return history;
  }
  storeCalls(userId, history.calls);
  markSynced(userId, history.message);
  const enforced = await enforceUser(userId);
  return { ok: enforced.ok, message: enforced.message };
}

export async function enforceUser(userId: number) {
  if (!flagOn("minutes.enforce")) return { ok: true, message: "Stopping calls at VoIP.ms is turned off." };
  const sub = getSubaccount(userId);
  if (!sub) return { ok: true, message: "No VoIP.ms line account yet." };
  const balance = minuteBalance(userId);
  if (balance.totalSeconds > 0) return setOutboundLocked(userId, false);
  const grants = grantsFor(userId);
  const activeGrant = grants.some((grant) => grant.period_start <= new Date().toISOString() && new Date().toISOString() < grant.period_end);
  if (activeGrant && !sub.last_sync) return { ok: true, message: "Call minutes have not been read from VoIP.ms yet, so outbound was left unchanged." };
  return setOutboundLocked(userId, true);
}

export async function syncAllMinutes() {
  const rows = getDb().prepare("SELECT user_id FROM voip_subaccounts").all() as { user_id: number }[];
  const messages: string[] = [];
  for (const row of rows) {
    const result = await syncUserMinutes(row.user_id);
    messages.push(result.message);
  }
  if (rows.length === 0) return { ok: true, message: "No line accounts to update yet." };
  return { ok: messages.every((message) => !message.startsWith("VoIP.ms did not")), message: messages[messages.length - 1] || "Updated." };
}

export function bundleByName(name: string) {
  const bundles = readDoc<{ name?: string; minutes?: number; price?: number; enabled?: boolean }[]>("minute_bundles");
  const bundle = bundles.find((item) => item.name === name && item.enabled !== false);
  if (!bundle) return null;
  const minutes = Number(bundle.minutes) || 0;
  const price = Number(bundle.price) || 0;
  if (minutes <= 0 || price <= 0) return null;
  return { name: String(bundle.name), minutes, price };
}

export function planMinutes(plan: Plan | undefined) {
  return Math.max(0, Math.round(Number(plan?.includedMinutes) || 0));
}
