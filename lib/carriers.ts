import { getDb } from "./db";
import { carrierSearchType, didMatches, type DigitSearch } from "./did-search";
import { readDids, type ListedDid } from "./did-list";
import { adminPbxError, pbxAccessMessage, roleFromToken } from "./pbx-access";
import { readRateCenters } from "./places";

export type PublicConfig = Record<string, string>;

export type Connection = {
  provider: string;
  enabled: number;
  public_json: string;
  secret: string;
  last_ok: number;
  last_message: string;
  checked_at: string;
};

export function getConnection(provider: string): Connection & { public: PublicConfig; hasSecret: boolean } {
  const row = getDb().prepare("SELECT * FROM connections WHERE provider = ?").get(provider) as Connection | undefined;
  const fallback: Connection = { provider, enabled: 0, public_json: "{}", secret: "", last_ok: 0, last_message: "", checked_at: "" };
  const current = row || fallback;
  let parsed: PublicConfig = {};
  try {
    const value = JSON.parse(current.public_json) as unknown;
    if (value && typeof value === "object") {
      parsed = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
    }
  } catch {
    parsed = {};
  }
  return { ...current, public: parsed, hasSecret: Boolean(current.secret) };
}

export function saveConnection(provider: string, enabled: boolean, config: PublicConfig, secret: string | null) {
  const existing = getConnection(provider);
  const nextSecret = secret == null || secret === "" ? existing.secret : secret;
  getDb()
    .prepare(
      `INSERT INTO connections (provider, enabled, public_json, secret, last_ok, last_message, checked_at)
       VALUES (?, ?, ?, ?, 0, '', '')
       ON CONFLICT(provider) DO UPDATE SET enabled = excluded.enabled, public_json = excluded.public_json, secret = excluded.secret`,
    )
    .run(provider, enabled ? 1 : 0, JSON.stringify(config), nextSecret);
}

function recordCheck(provider: string, ok: boolean, message: string) {
  getDb()
    .prepare("UPDATE connections SET last_ok = ?, last_message = ?, checked_at = ? WHERE provider = ?")
    .run(ok ? 1 : 0, message.slice(0, 400), new Date().toISOString(), provider);
}

function voipmsEndpoint(value: string) {
  const url = new URL(value || "https://voip.ms/api/v1/rest.php");
  if (url.protocol !== "https:" || !url.hostname.endsWith("voip.ms")) throw new Error("The VoIP.ms address must be https on voip.ms.");
  return url;
}

export async function callVoipms(method: string, params: Record<string, string>) {
  const connection = getConnection("voipms");
  if (!connection.enabled || !connection.public.api_username || !connection.secret) {
    return { ok: false, status: "not_configured", message: "VoIP.ms is not enabled or is missing credentials.", body: null };
  }
  const url = voipmsEndpoint(connection.public.endpoint || "https://voip.ms/api/v1/rest.php");
  url.searchParams.set("api_username", connection.public.api_username);
  url.searchParams.set("api_password", connection.secret);
  url.searchParams.set("method", method);
  url.searchParams.set("content_type", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const body = (await response.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status || `http_${response.status}`;
  return { ok: status === "success", status, message: status, body };
}

export function inventoryReady() {
  const connection = getConnection("voipms");
  return Boolean(connection.enabled && connection.hasSecret && connection.public.api_username);
}

export async function listRateCenters(country: string, region: string) {
  const method = country === "CA" ? "getRateCentersCAN" : "getRateCentersUSA";
  const key = country === "CA" ? "province" : "state";
  const result = await callVoipms(method, { [key]: region.toUpperCase() });
  if (!result.ok) return { ok: false, message: result.message, places: [] as string[] };
  return { ok: true, message: "", places: readRateCenters(result.body) };
}

export async function listedCity(country: string, region: string, city: string) {
  const listed = await listRateCenters(country, region);
  if (!listed.ok) {
    console.error(`[sauticall] cities ${listed.message}`);
    return { ok: false as const, message: "The city list is not available right now. Try again shortly.", city: "" };
  }
  const match = listed.places.find((place) => place.toUpperCase() === city.trim().toUpperCase());
  if (!match) return { ok: false as const, message: "Choose a city from the list.", city: "" };
  return { ok: true as const, message: "", city: match };
}

export async function searchDids(country: string, region: string, ratecenter: string, limit = 20): Promise<{ ok: boolean; message: string; dids: ListedDid[] }> {
  const method = country === "CA" ? "getDIDsCAN" : "getDIDsUSA";
  const regionKey = country === "CA" ? "province" : "state";
  const result = await callVoipms(method, { [regionKey]: region.toUpperCase(), ratecenter: ratecenter.toUpperCase() });
  if (!result.ok) return { ok: false, message: result.message, dids: [] };
  return { ok: true, message: "success", dids: readDids(result.body, limit) };
}

export async function searchPatternDids(country: string, region: string, search: DigitSearch, limit = 20) {
  const method = country === "CA" ? "searchDIDsCAN" : "searchDIDsUSA";
  const regionKey = country === "CA" ? "province" : "state";
  const result = await callVoipms(method, { [regionKey]: region.toUpperCase(), type: carrierSearchType(search.mode), query: search.query });
  if (!result.ok && !result.status.startsWith("no_")) return { ok: false, message: result.message, dids: [] as ListedDid[] };
  const dids = readDids(result.body, 0).filter((item) => didMatches(item.did, search)).slice(0, limit);
  return { ok: true, message: "success", dids };
}

export async function findInventoryDid(country: string, region: string, ratecenter: string, did: string) {
  const wanted = did.replace(/\D/g, "");
  const normalized = wanted.length === 11 && wanted.startsWith("1") ? wanted.slice(1) : wanted;
  if (!/^[2-9]\d{9}$/.test(normalized)) return null;
  const centers = ratecenter ? [ratecenter, ""] : [""];
  for (const center of centers) {
    const result = await searchDids(country, region, center, 0);
    const match = result.dids.find((item) => item.did.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1") === normalized);
    if (match) return { ...match, did: normalized };
    if (!result.ok && center === "") return null;
  }
  return null;
}

export async function orderDid(did: string, routingOverride?: string, resellerAccount?: string) {
  const connection = getConnection("voipms");
  const routing = routingOverride || connection.public.routing;
  const pop = connection.public.pop;
  const dialtime = connection.public.dialtime || "60";
  if (!routing || !pop) return { ok: false, message: "Set the VoIP.ms routing and POP in Connections before ordering." };
  return callVoipms("orderDID", {
    did,
    routing,
    ...(resellerAccount ? { account: resellerAccount } : {}),
    pop,
    dialtime,
    cnam: connection.public.cnam === "1" ? "1" : "0",
    billing_type: connection.public.billing_type === "2" ? "2" : "1",
  });
}

export async function submitPort(params: Record<string, string>) {
  return callVoipms("addLNPPort", params);
}

export async function portStatus(portId: string) {
  return callVoipms("getLNPStatus", { port_id: portId });
}

function httpsHost(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("The 3CX address must use https.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "169.254.169.254" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    throw new Error("Use the public 3CX hostname.");
  }
  return url.origin;
}

export async function testVoipms() {
  try {
    const result = await callVoipms("getBalance", {});
    if (!result.ok) {
      const message = `VoIP.ms returned ${result.status}.`;
      recordCheck("voipms", false, message);
      return { ok: false, message };
    }
    const clients = await callVoipms("getClients", {});
    const balance = result.body && typeof result.body === "object" ? String((result.body as { balance?: unknown }).balance || "") : "";
    const reseller = clients.ok || clients.status === "no_client";
    const message = reseller
      ? `Connected. Balance ${balance || "returned"}. Reseller clients are available on this login.`
      : `The balance was read, but reseller clients returned ${clients.status}.`;
    recordCheck("voipms", reseller, message);
    return { ok: reseller, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "VoIP.ms could not be reached.";
    recordCheck("voipms", false, message);
    return { ok: false, message };
  }
}

async function accessToken(connection: ReturnType<typeof getConnection>) {
  if (!connection.enabled || !connection.public.base_url || !connection.public.client_id || !connection.secret) {
    throw new Error("3CX is not enabled or is missing credentials.");
  }
  const origin = httpsHost(connection.public.base_url);
  const tokenResponse = await fetch(`${origin}/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: connection.public.client_id, client_secret: connection.secret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(20000),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
  if (!tokenResponse.ok || !token?.access_token) throw new Error("3CX did not return an access token.");
  return { origin, token: token.access_token };
}

export async function pbxRequest(path: string, init: { method?: string; body?: unknown } = {}) {
  try {
    const { origin, token } = await accessToken(getConnection("3cx"));
    const response = await fetch(`${origin}/xapi/v1/${path}`, {
      method: init.method || "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "odata-version": "4.0",
        ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    const body = parseBody(text);
    const error = xapiError(body, text);
    const role = roleFromToken(token);
    const message = response.ok ? error.message || "ok" : adminPbxError(response.status, role, error.code, error.message);
    return { ok: response.ok, status: response.status, body, message, code: error.code, detail: error.message, role, location: response.headers.get("location") || "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "3CX could not be reached.";
    return { ok: false, status: 0, body: null, message, location: "" };
  }
}

function parseBody(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function xapiError(body: unknown, text: string) {
  if (body && typeof body === "object") {
    const record = body as { error?: { code?: unknown; message?: unknown }; code?: unknown; message?: unknown };
    const nested = record.error && typeof record.error === "object" ? record.error : record;
    const code = typeof nested.code === "string" ? nested.code : "";
    const message = typeof nested.message === "string" ? nested.message : "";
    if (code || message) return { code, message: message.replace(/\s+/g, " ").trim().slice(0, 800) };
  }
  return { code: "", message: text.replace(/\s+/g, " ").trim().slice(0, 800) };
}

function xapiMessage(body: unknown, fallback: string) {
  return xapiError(body, fallback).message || fallback;
}

export async function test3cx() {
  const connection = getConnection("3cx");
  try {
    const { origin, token } = await accessToken(connection);
    const defs = await fetch(`${origin}/xapi/v1/Defs?$select=Id`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    const version = defs.headers.get("x-3cx-version") || "";
    if (!defs.ok) {
      const body = await defs.json().catch(() => null);
      throw new Error(pbxAccessMessage(defs.status, roleFromToken(token), xapiMessage(body, "")));
    }
    const role = roleFromToken(token);
    const message = `Connected${version ? `. Version ${version}` : ""}${role ? `. Role ${role.replace(/_/g, " ")}` : ""}.`;
    recordCheck("3cx", true, message);
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "3CX could not be reached.";
    recordCheck("3cx", false, message);
    return { ok: false, message };
  }
}
