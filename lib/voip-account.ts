import { callVoipms, getConnection } from "./carriers";
import { getDb } from "./db";
import { readOutboundCalls, type CdrCall } from "./minute-math";
import { appPassword } from "./pbx";

export type Subaccount = {
  user_id: number;
  account: string;
  username: string;
  password: string;
  sip_host: string;
  locked: number;
  settings_json: string;
  last_message: string;
  last_sync: string;
};

type Settings = Record<string, string>;

function usernameFor(userId: number) {
  return `sc${String(userId).padStart(4, "0")}`;
}

function sipHost(pop: string) {
  const value = pop.trim();
  if (!value) return "";
  return value.includes(".") ? value : `${value}.voip.ms`;
}

function settingsFromConnection(): Settings {
  const config = getConnection("voipms").public;
  return {
    protocol: "1",
    device_type: config.device_type || "1",
    lock_international: config.lock_international === "1" ? "1" : "0",
    international_route: config.international_route === "2" ? "2" : "1",
    music_on_hold: config.music_on_hold || "default",
    allowed_codecs: config.allowed_codecs || "ulaw;alaw;g729",
    dtmf_mode: config.dtmf_mode || "auto",
    nat: config.nat || "yes",
  };
}

function readSettings(raw: string): Settings {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
  } catch {
    return settingsFromConnection();
  }
}

export function getSubaccount(userId: number) {
  return getDb().prepare("SELECT * FROM voip_subaccounts WHERE user_id = ?").get(userId) as Subaccount | undefined;
}

function saveSubaccount(row: Omit<Subaccount, "last_message" | "last_sync" | "locked"> & { locked?: number }) {
  getDb().prepare(
    `INSERT INTO voip_subaccounts (user_id, account, username, password, sip_host, locked, settings_json, last_message, last_sync)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', '')
     ON CONFLICT(user_id) DO UPDATE SET account = excluded.account, username = excluded.username, password = excluded.password, sip_host = excluded.sip_host, settings_json = excluded.settings_json`,
  ).run(row.user_id, row.account, row.username, row.password, row.sip_host, row.locked ? 1 : 0, row.settings_json);
}

function listedAccounts(body: unknown) {
  if (!body || typeof body !== "object") return [] as { account: string; username: string; description: string }[];
  const record = body as Record<string, unknown>;
  const list = record.accounts || record.subaccounts || record.sub_accounts;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { account: String(row.account || ""), username: String(row.username || ""), description: String(row.description || "") };
  }).filter((item) => item.account);
}

function createdAccount(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  return String(record.account || record.subaccount || "");
}

export async function ensureSubaccount(userId: number): Promise<{ ok: true; account: string; sipHost: string } | { ok: false; message: string }> {
  const existing = getSubaccount(userId);
  if (existing?.account && existing.password) return { ok: true, account: existing.account, sipHost: existing.sip_host };
  const connection = getConnection("voipms");
  if (!connection.enabled || !connection.secret) return { ok: false, message: "VoIP.ms is not connected, so a line account was not created." };
  const username = usernameFor(userId);
  const settings = settingsFromConnection();
  const description = `SautiCall ${userId}`;
  const host = sipHost(connection.public.pop || "");
  const listed = await callVoipms("getSubAccounts", {});
  const found = listedAccounts(listed.body).find((item) => item.username === username || item.account.endsWith(`_${username}`) || item.description === description);
  const password = appPassword();
  if (found) {
    const updated = await callVoipms("setSubAccount", { account: found.account, description, auth_type: "1", password, ...settings });
    if (!updated.ok) return { ok: false, message: `VoIP.ms did not update the line account (${updated.status}).` };
    saveSubaccount({ user_id: userId, account: found.account, username, password, sip_host: host, settings_json: JSON.stringify(settings) });
    return { ok: true, account: found.account, sipHost: host };
  }
  const created = await callVoipms("createSubAccount", { username, description, auth_type: "1", password, ...settings });
  const account = createdAccount(created.body);
  if (!created.ok || !account) return { ok: false, message: `VoIP.ms did not create a line account (${created.status}).` };
  saveSubaccount({ user_id: userId, account, username, password, sip_host: host, settings_json: JSON.stringify(settings) });
  return { ok: true, account, sipHost: host };
}

async function routeDids(userId: number, routing: string) {
  const dids = getDb().prepare("SELECT did FROM phone_lines WHERE user_id = ?").all(userId) as { did: string }[];
  for (const line of dids) {
    const result = await callVoipms("setDIDRouting", { did: line.did, routing });
    if (!result.ok) return result;
  }
  return { ok: true, status: "success", message: "success", body: null };
}

export async function setOutboundLocked(userId: number, locked: boolean) {
  const row = getSubaccount(userId);
  if (!row) return { ok: false, message: "This customer has no VoIP.ms line account yet." };
  if (Boolean(row.locked) === locked) return { ok: true, message: locked ? "Outbound is already stopped." : "Outbound is already allowed." };
  const settings = readSettings(row.settings_json);
  const mainRouting = getConnection("voipms").public.routing;
  const lineRouting = `account:${row.account}`;
  if (locked && mainRouting && mainRouting !== lineRouting) {
    const moved = await routeDids(userId, mainRouting);
    if (!moved.ok) {
      const message = `Inbound routing was not moved, so outbound was left unchanged (${moved.status}).`;
      getDb().prepare("UPDATE voip_subaccounts SET last_message = ? WHERE user_id = ?").run(message, userId);
      return { ok: false, message };
    }
  }
  const result = await callVoipms("setSubAccount", {
    account: row.account,
    description: `SautiCall ${userId}`,
    ...settings,
    auth_type: locked ? "2" : "1",
    password: locked ? "" : row.password,
    ip: locked ? "203.0.113.1" : "",
  });
  let routed = true;
  if (result.ok && !locked) routed = (await routeDids(userId, lineRouting)).ok;
  const pausedInbound = locked && (!mainRouting || mainRouting === lineRouting);
  const message = !result.ok
    ? `VoIP.ms did not change outbound calling (${result.status}).`
    : !routed
      ? "Outbound calls are allowed, but the number was not pointed back at the line account."
      : locked
        ? `Outbound calls are stopped at VoIP.ms.${pausedInbound ? " Inbound uses this same line, so it pauses until minutes are added." : ""}`
        : "Outbound calls are allowed at VoIP.ms.";
  getDb().prepare("UPDATE voip_subaccounts SET locked = ?, last_message = ? WHERE user_id = ?").run(result.ok && locked ? 1 : result.ok ? 0 : row.locked, message, userId);
  return { ok: result.ok, message };
}

export async function fetchOutboundCalls(account: string, from: string, to: string) {
  const result = await callVoipms("getCDR", {
    account,
    date_from: from,
    date_to: to,
    answered: "1",
    noanswer: "1",
    busy: "1",
    failed: "0",
  });
  if (result.status === "no_cdr") return { ok: true, calls: [] as CdrCall[], message: "No calls in this period." };
  if (!result.ok) return { ok: false, calls: [] as CdrCall[], message: `VoIP.ms did not return call history (${result.status}).` };
  return { ok: true, calls: readOutboundCalls(result.body), message: "Call history read." };
}

export function markSynced(userId: number, message: string) {
  getDb().prepare("UPDATE voip_subaccounts SET last_sync = ?, last_message = ? WHERE user_id = ?").run(new Date().toISOString(), message.slice(0, 400), userId);
}
