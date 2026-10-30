import { customerRouteVerdict, selectSavedTrunk, type RouteClient } from "./ai-route";
import { getConnection } from "./carriers";
import { audit, getDb } from "./db";
import { extensionRange } from "./extension-numbers";
import { readExtensionPlan } from "./extension-plan";

type LineRow = { id: number; did: string; trunk_id: number; status: string };

function spanFor(userId: number) {
  const row = getDb().prepare("SELECT number_from, number_to FROM pbx_departments WHERE user_id = ?").get(userId) as { number_from: string; number_to: string } | undefined;
  if (row && /^\d+$/.test(row.number_from) && /^\d+$/.test(row.number_to)) return { from: row.number_from, to: row.number_to };
  const range = extensionRange(userId, readExtensionPlan());
  return { from: String(range.from), to: String(range.to) };
}

function resellerClient(raw: string) {
  try {
    const value = JSON.parse(raw) as { reseller_client?: unknown };
    return String(value.reseller_client || "").trim();
  } catch {
    return "";
  }
}

function savedLines(lines: LineRow[], presented: string) {
  return selectSavedTrunk(lines.map((row) => ({ did: row.did, trunkId: row.trunk_id, status: row.status })), presented);
}

export function customerRoute(userId: number) {
  const extension = getDb().prepare(
    "SELECT number, xapi_id, status FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY id LIMIT 1",
  ).get(userId) as { number: string; xapi_id: number; status: string } | undefined;
  const lines = getDb().prepare(
    "SELECT id, did, trunk_id, status FROM phone_lines WHERE user_id = ? ORDER BY id DESC",
  ).all(userId) as LineRow[];
  const campaign = getDb().prepare("SELECT caller_id FROM ai_campaigns WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as { caller_id: string } | undefined;
  const presented = campaign?.caller_id || "";
  const saved = savedLines(lines, presented);
  const trunk = saved.trunk;
  const sub = getDb().prepare(
    "SELECT account, username, sip_host, settings_json FROM voip_subaccounts WHERE user_id = ?",
  ).get(userId) as { account: string; username: string; sip_host: string; settings_json: string } | undefined;
  const client = getDb().prepare("SELECT client_id FROM voip_clients WHERE user_id = ?").get(userId) as { client_id: string } | undefined;
  const span = spanFor(userId);
  const account: RouteClient | null = sub || client
    ? {
        account: sub?.account || "",
        username: sub?.username || "",
        sipHost: sub?.sip_host || "",
        clientId: client?.client_id || "",
        resellerClient: resellerClient(sub?.settings_json || ""),
      }
    : null;
  return customerRouteVerdict({
    extension: extension ? { number: extension.number, xapiId: extension.xapi_id, status: extension.status } : null,
    spanFrom: span.from,
    spanTo: span.to,
    trunk,
    presentedCallerId: presented || trunk?.did || "",
    scope: saved.scope,
    client: account,
    resellerLogin: getConnection("voipms").public.api_username || "",
  });
}

export function listRouteCustomers(query: string) {
  const q = query.trim().slice(0, 80);
  return getDb().prepare(
    `SELECT id, name, email FROM users
     WHERE role = 'customer' AND (? = '' OR email LIKE ? OR name LIKE ?)
     ORDER BY id DESC LIMIT 40`,
  ).all(q, `%${q}%`, `%${q}%`) as { id: number; name: string; email: string }[];
}

export function savedRoutes() {
  return getDb().prepare(
    "SELECT user_id, primary_status, backup_status, checked_at FROM ai_outbound_routes",
  ).all() as { user_id: number; primary_status: string; backup_status: string; checked_at: string }[];
}

export function saveCustomerRoute(userId: number, actor: string) {
  const person = getDb().prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'").get(userId) as { id: number } | undefined;
  if (!person) return { ok: false as const, message: "That customer was not found." };
  const verdict = customerRoute(userId);
  const detail = verdict.lines.map((line) => line.text).join(" ");
  getDb().prepare(
    `INSERT INTO ai_outbound_routes (
       user_id, extension_number, trunk_id, caller_id, scope, primary_status, backup_status,
       client_account, client_id, sip_host, idle, place_call, detail, checked_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       extension_number = excluded.extension_number,
       trunk_id = excluded.trunk_id,
       caller_id = excluded.caller_id,
       scope = excluded.scope,
       primary_status = excluded.primary_status,
       backup_status = excluded.backup_status,
       client_account = excluded.client_account,
       client_id = excluded.client_id,
       sip_host = excluded.sip_host,
       idle = 1,
       place_call = 0,
       detail = excluded.detail,
       checked_at = excluded.checked_at`,
  ).run(
    userId,
    verdict.extensionNumber,
    verdict.trunkId,
    verdict.callerId,
    verdict.scope,
    verdict.primary,
    verdict.backup,
    verdict.clientAccount,
    verdict.clientId,
    verdict.sipHost,
    detail.slice(0, 800),
    new Date().toISOString(),
  );
  audit(actor, "ai.route.check", String(userId));
  return { ok: true as const, verdict };
}
