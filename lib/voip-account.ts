import { callVoipms, getConnection, VOIPMS_READ_MS, VOIPMS_WRITE_MS } from "./carriers";
import { getDb } from "./db";
import { lineCodecs } from "./line-codecs";
import { planPaidAt, resolvedLineValue } from "./line-variable-store";
import { lineOverride, nextBillingDate } from "./line-variables";
import { readOutboundCalls, type CdrCall } from "./minute-math";
import { appPassword, paidPlan } from "./pbx";
import { ensureCustomerCode } from "./customer-code-store";
import { choosePlanPackage, chooseResellerPackage } from "./reseller-package";
import { applyLineTemplate, callerIdDigits, lineTemplateDrift, sipUsernameCandidates, TRUNK_SIP_DEFAULTS } from "./sip-account";
import { matchListedSubaccount, readCreatedSubaccount, readListedSubaccounts, subaccountDigits, subaccountUpdateParams } from "./subaccount-ref";

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
  provider_id: string;
};

type Settings = Record<string, string>;

function sipHost(pop: string) {
  const value = pop.trim();
  if (!value) return "";
  return value.includes(".") ? value : `${value}.voip.ms`;
}

function configured(value: string | undefined, fallback: string) {
  const next = (value || "").trim();
  return next || fallback;
}

function paidPlanName(userId: number) {
  const named = paidPlan(userId)?.name;
  if (named) return named;
  const row = getDb().prepare("SELECT plan_name FROM payment_attempts WHERE user_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1").get(userId) as { plan_name: string } | undefined;
  return row?.plan_name?.trim() || "";
}

function accountLabel(userId: number) {
  const code = ensureCustomerCode(userId);
  return code ? `SautiCall ${code}` : `SautiCall ${userId}`;
}

function settingsFromConnection(userId = 0): Settings {
  const config = getConnection("voipms").public;
  const settings: Settings = {
    ...TRUNK_SIP_DEFAULTS,
    allowed_codecs: lineCodecs(configured(config.allowed_codecs, TRUNK_SIP_DEFAULTS.allowed_codecs)),
    dtmf_mode: configured(config.dtmf_mode, TRUNK_SIP_DEFAULTS.dtmf_mode),
    nat: configured(config.nat, TRUNK_SIP_DEFAULTS.nat),
  };
  if (!userId) return applyLineTemplate(settings);
  for (const key of ["allowed_codecs", "dtmf_mode", "nat"]) {
    const value = resolvedLineValue(userId, key);
    if (value.trim() === "") continue;
    settings[key] = key === "allowed_codecs" ? lineCodecs(lineOverride(settings[key] || "", value)) : lineOverride(settings[key] || "", value);
  }
  return applyLineTemplate(settings);
}

function readStoredSettings(raw: string): Settings {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
  } catch {
    return {};
  }
}

function readSettings(raw: string): Settings {
  const stored = readStoredSettings(raw);
  return Object.keys(stored).length ? forLine(stored) : settingsFromConnection();
}

function forLine(settings: Settings, did = ""): Settings {
  const next: Settings = applyLineTemplate({ ...settings, allowed_codecs: lineCodecs(settings.allowed_codecs || "") }, did);
  if (!next.reseller_client || !next.reseller_package) {
    delete next.reseller_client;
    delete next.reseller_package;
    delete next.reseller_nextbilling;
  }
  return next;
}

function resellerRejected(result: { status: string; message: string }) {
  return /resellerpackage|resellerclient|resellernextbilling/i.test(`${result.status} ${result.message}`);
}

async function lineClientSettings(base: Settings, resellerClient: string, userId: number, planName = "") {
  const settings = forLine(base);
  delete settings.reseller_client;
  delete settings.reseller_package;
  delete settings.reseller_nextbilling;
  if (!resellerClient) return { settings, warning: "" };
  const catalog = await callVoipms("getPackages", {}, VOIPMS_READ_MS);
  let packageId = choosePlanPackage(planName, catalog.body);
  if (!packageId) {
    const assigned = await callVoipms("getClientPackages", { client: resellerClient }, VOIPMS_READ_MS);
    packageId = chooseResellerPackage(assigned.body, catalog.body);
  }
  if (!packageId) {
    return { settings, warning: `VoIP.ms has no reseller package, so client ${resellerClient} was not attached to the line account.` };
  }
  const date = nextBillingDate(planPaidAt(userId), resolvedLineValue(userId, "billing_days") || "30");
  return { settings: { ...settings, reseller_client: resellerClient, reseller_package: packageId, reseller_nextbilling: date }, warning: "" };
}

async function openLine(settings: Settings, run: (next: Settings) => ReturnType<typeof callVoipms>) {
  const call = await sendLine(settings, run);
  if (call.result.ok || !resellerRejected(call.result)) return { ...call, detached: "" };
  const again = await sendLine(forLine({ ...call.settings, reseller_client: "", reseller_package: "", reseller_nextbilling: "" }), run);
  return { ...again, detached: call.result.message || call.result.status };
}

async function sendLine(settings: Settings, run: (next: Settings) => ReturnType<typeof callVoipms>): Promise<{ result: Awaited<ReturnType<typeof callVoipms>>; settings: Settings }> {
  const ready = forLine(settings);
  const first = await run(ready);
  if (first.ok || ready.allowed_codecs === "ulaw" || !/invalid_allowedcodecs/i.test(`${first.status} ${first.message}`)) return { result: first, settings: ready };
  const plain: Settings = { ...ready, allowed_codecs: "ulaw" };
  return { result: await run(plain), settings: plain };
}

export function getSubaccount(userId: number) {
  return getDb().prepare("SELECT * FROM voip_subaccounts WHERE user_id = ?").get(userId) as Subaccount | undefined;
}

function saveSubaccount(row: Omit<Subaccount, "last_message" | "last_sync" | "locked" | "provider_id"> & { locked?: number; provider_id?: string }) {
  getDb().prepare(
    `INSERT INTO voip_subaccounts (user_id, account, username, password, sip_host, locked, settings_json, last_message, last_sync, provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?)
     ON CONFLICT(user_id) DO UPDATE SET account = excluded.account, username = excluded.username, password = excluded.password, sip_host = excluded.sip_host, settings_json = excluded.settings_json,
       provider_id = CASE WHEN excluded.provider_id != '' THEN excluded.provider_id ELSE voip_subaccounts.provider_id END`,
  ).run(row.user_id, row.account, row.username, row.password, row.sip_host, row.locked ? 1 : 0, row.settings_json, row.provider_id || "");
}

async function lineAccountId(userId: number, account: string, known = "") {
  const saved = subaccountDigits(known);
  if (saved) return saved;
  const listed = await callVoipms("getSubAccounts", {}, VOIPMS_READ_MS);
  const found = readListedSubaccounts(listed.body).find((item) => item.account === account);
  if (!found?.id) return "";
  getDb().prepare("UPDATE voip_subaccounts SET provider_id = ? WHERE user_id = ?").run(found.id, userId);
  return found.id;
}

export async function linkSubaccountClient(userId: number, clientId: string) {
  const row = getSubaccount(userId);
  if (!row?.account || !clientId) return { ok: true, message: "" };
  const settings = readSettings(row.settings_json);
  if (settings.reseller_client === clientId && settings.reseller_package && settings.device_type === TRUNK_SIP_DEFAULTS.device_type) return { ok: true, message: "" };
  const attached = await lineClientSettings(settings, clientId, userId, paidPlanName(userId));
  if (!attached.settings.reseller_package) return { ok: false, message: attached.warning };
  const id = await lineAccountId(userId, row.account, row.provider_id);
  if (!id) return { ok: false, message: "VoIP.ms did not return a numeric id for this line account, so it was not linked to the client." };
  const result = await callVoipms("setSubAccount", subaccountUpdateParams(id, {
    ...attached.settings,
    description: accountLabel(userId),
    auth_type: row.locked ? "2" : "1",
    password: row.locked ? "" : row.password,
  }), VOIPMS_WRITE_MS);
  if (!result.ok) return { ok: false, message: `VoIP.ms did not link the line account to the client (${result.message || result.status}).` };
  getDb().prepare("UPDATE voip_subaccounts SET settings_json = ? WHERE user_id = ?").run(JSON.stringify(attached.settings), userId);
  return { ok: true, message: "" };
}

async function ensureLineTemplate(userId: number, did = "") {
  const row = getSubaccount(userId);
  if (!row?.account) return { ok: true as const, message: "" };
  const stored = readStoredSettings(row.settings_json);
  if (!lineTemplateDrift(stored, did)) return { ok: true as const, message: "" };
  const id = await lineAccountId(userId, row.account, row.provider_id);
  if (!id) return { ok: false as const, message: "VoIP.ms did not return a numeric id for this line account, so the line settings were not updated." };
  const settings = forLine({ ...settingsFromConnection(userId), ...stored }, did);
  const result = await callVoipms("setSubAccount", subaccountUpdateParams(id, {
    ...settings,
    description: accountLabel(userId),
    auth_type: row.locked ? "2" : "1",
    password: row.locked ? "" : row.password,
    ...(row.locked ? { ip: "203.0.113.1" } : {}),
  }), VOIPMS_WRITE_MS);
  if (!result.ok) return { ok: false as const, message: `VoIP.ms did not apply the line account template (${result.message || result.status}).` };
  getDb().prepare("UPDATE voip_subaccounts SET settings_json = ? WHERE user_id = ?").run(JSON.stringify(settings), userId);
  return { ok: true as const, message: "" };
}

export async function ensureSubaccount(userId: number, resellerClient = "", did = ""): Promise<{ ok: true; account: string; sipHost: string; warning?: string } | { ok: false; message: string }> {
  const existing = getSubaccount(userId);
  if (existing?.account && existing.password) {
    let warning = "";
    const device = await ensureLineTemplate(userId, did);
    if (!device.ok) warning = device.message;
    if (resellerClient) {
      const linked = await linkSubaccountClient(userId, resellerClient);
      if (!linked.ok) warning = linked.message;
    }
    return { ok: true, account: existing.account, sipHost: existing.sip_host, warning };
  }
  const connection = getConnection("voipms");
  if (!connection.enabled || !connection.secret) return { ok: false, message: "VoIP.ms is not connected, so a line account was not created." };
  const code = ensureCustomerCode(userId);
  const names = sipUsernameCandidates(code);
  if (!names.length) return { ok: false, message: "This customer has no customer ID, so the SIP username was not created." };
  const planName = paidPlanName(userId);
  if (!planName) return { ok: false, message: "The SIP account is created after a paid plan is on this customer and a number is bought." };
  const caller = callerIdDigits(did);
  const base = caller ? { ...settingsFromConnection(userId), callerid_number: caller } : settingsFromConnection(userId);
  const attached = await lineClientSettings(base, resellerClient, userId, planName);
  let settings = attached.settings;
  const description = accountLabel(userId);
  const host = sipHost(connection.public.pop || "");
  const password = appPassword();
  let username = names[0];
  let createdCall: Awaited<ReturnType<typeof openLine>> = { result: { ok: false, status: "invalid_username", message: "invalid_username", body: null }, settings: attached.settings, detached: "" };
  for (const candidate of names) {
    username = candidate;
    createdCall = await openLine(attached.settings, (next) => callVoipms("createSubAccount", { username: candidate, description, auth_type: "1", password, ...next }, VOIPMS_WRITE_MS));
    if (!createdCall.result.ok && /callerid/i.test(`${createdCall.result.status} ${createdCall.result.message}`) && attached.settings.callerid_number) {
      const stripped = { ...attached.settings };
      delete stripped.callerid_number;
      createdCall = await openLine(stripped, (next) => callVoipms("createSubAccount", { username: candidate, description, auth_type: "1", password, ...next }, VOIPMS_WRITE_MS));
    }
    if (createdCall.result.ok || !/invalid_username/i.test(`${createdCall.result.status} ${createdCall.result.message}`)) break;
  }
  settings = createdCall.settings;
  const created = createdCall.result;
  const detached = createdCall.detached
    ? `VoIP.ms refused the reseller package (${createdCall.detached}), so client ${resellerClient} was not attached.`
    : attached.warning;
  const createdRef = readCreatedSubaccount(created.body);
  if (created.ok && createdRef.account) {
    saveSubaccount({ user_id: userId, account: createdRef.account, username, password, sip_host: host, settings_json: JSON.stringify(settings), provider_id: createdRef.id });
    return { ok: true, account: createdRef.account, sipHost: host, warning: detached || undefined };
  }
  const listed = await callVoipms("getSubAccounts", {}, VOIPMS_READ_MS);
  const rows = readListedSubaccounts(listed.body);
  const found = names.map((candidate) => matchListedSubaccount(rows, candidate, description)).find((item) => item);
  if (found) {
    username = found.username || username;
    if (!found.id) {
      saveSubaccount({ user_id: userId, account: found.account, username, password, sip_host: host, settings_json: JSON.stringify(settings) });
      const missingId = "VoIP.ms listed the line account without a numeric id, so its settings were not updated.";
      return { ok: true, account: found.account, sipHost: host, warning: [detached, missingId].filter(Boolean).join(" ") };
    }
    const updatedCall = await openLine(settings, (next) => callVoipms("setSubAccount", subaccountUpdateParams(found.id, { description, auth_type: "1", password, ...next }), VOIPMS_WRITE_MS));
    const savedSettings = updatedCall.result.ok ? updatedCall.settings : settings;
    saveSubaccount({ user_id: userId, account: found.account, username, password, sip_host: host, settings_json: JSON.stringify(savedSettings), provider_id: found.id });
    const updateWarning = !updatedCall.result.ok
      ? `VoIP.ms listed the line account, but did not update it (${updatedCall.result.message || updatedCall.result.status}).`
      : updatedCall.detached
        ? `VoIP.ms refused the reseller package (${updatedCall.detached}), so client ${resellerClient} was not attached.`
        : detached;
    return { ok: true, account: found.account, sipHost: host, warning: updateWarning || undefined };
  }
  return { ok: false, message: `VoIP.ms did not create a line account (${created.message || created.status}).` };
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
  if (settings.reseller_client && settings.reseller_package) {
    settings.reseller_nextbilling = nextBillingDate(planPaidAt(userId), resolvedLineValue(userId, "billing_days") || "30");
  }
  const id = await lineAccountId(userId, row.account, row.provider_id);
  if (!id) return { ok: false, message: "VoIP.ms did not return a numeric id for this line account, so outbound calling was not changed." };
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
  const result = await callVoipms("setSubAccount", subaccountUpdateParams(id, {
    description: accountLabel(userId),
    ...settings,
    auth_type: locked ? "2" : "1",
    password: locked ? "" : row.password,
    ip: locked ? "203.0.113.1" : "",
  }), VOIPMS_WRITE_MS);
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
