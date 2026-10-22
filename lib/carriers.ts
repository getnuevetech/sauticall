import { getDb } from "./db";
import { readDids, type ListedDid } from "./did-list";

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

export async function searchDids(country: string, region: string, ratecenter: string): Promise<{ ok: boolean; message: string; dids: ListedDid[] }> {
  const method = country === "CA" ? "getDIDsCAN" : "getDIDsUSA";
  const regionKey = country === "CA" ? "province" : "state";
  const result = await callVoipms(method, { [regionKey]: region.toUpperCase(), ratecenter: ratecenter.toUpperCase() });
  if (!result.ok) return { ok: false, message: result.message, dids: [] };
  return { ok: true, message: "success", dids: readDids(result.body) };
}

export async function orderDid(did: string) {
  const connection = getConnection("voipms");
  const routing = connection.public.routing;
  const pop = connection.public.pop;
  const dialtime = connection.public.dialtime || "60";
  if (!routing || !pop) return { ok: false, message: "Set the VoIP.ms routing and POP in Connections before ordering." };
  return callVoipms("orderDID", {
    did,
    routing,
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
    const balance = result.body && typeof result.body === "object" ? String((result.body as { balance?: unknown }).balance || "") : "";
    const message = result.ok ? `Connected. Balance ${balance || "returned"}.` : `VoIP.ms returned ${result.status}.`;
    recordCheck("voipms", result.ok, message);
    return { ok: result.ok, message };
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
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => null);
    const message = xapiMessage(body, `3CX answered ${response.status}.`);
    return { ok: response.ok, status: response.status, body, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "3CX could not be reached.";
    return { ok: false, status: 0, body: null, message };
  }
}

function xapiMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: { message?: string } }).error?.message;
    if (message) return message.replace(/\s+/g, " ").slice(0, 400);
  }
  return fallback;
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
    if (!defs.ok) throw new Error(`3CX answered ${defs.status}.`);
    const message = `Connected${version ? `. Version ${version}` : ""}.`;
    recordCheck("3cx", true, message);
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "3CX could not be reached.";
    recordCheck("3cx", false, message);
    return { ok: false, message };
  }
}
