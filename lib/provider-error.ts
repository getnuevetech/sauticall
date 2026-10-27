export type PopServer = { pop: string; names: string[] };

export function voipFailureText(status: string, body: unknown) {
  const code = status.trim() || "unknown";
  if (!body || typeof body !== "object") return code;
  const record = body as Record<string, unknown>;
  const bits = [record.message, record.error, record.description]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item && item !== code);
  const text = bits.join(" ").slice(0, 500);
  return text ? `${code}: ${text}` : code;
}

export function redactSecret(detail: string) {
  return detail
    .replace(/api_password=[^&\s]+/gi, "api_password=redacted")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=redacted")
    .replace(/bearer\s+[a-z0-9._~+/-]+/gi, "bearer redacted")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function matchOrderPop(raw: string, servers: PopServer[]) {
  const value = raw.trim();
  if (/^\d+$/.test(value)) return value;
  const key = value.toLowerCase().replace(/\.voip\.ms$/, "").replace(/[^a-z0-9]/g, "");
  if (!key) return value;
  const found = servers.find((server) => server.names.some((name) => {
    const normalized = name.toLowerCase().replace(/\.voip\.ms$/, "").replace(/[^a-z0-9]/g, "");
    if (!normalized) return false;
    if (normalized === key) return true;
    if (key.length < 4 || normalized.length < 4) return false;
    return normalized.includes(key) || key.includes(normalized);
  }));
  return found?.pop || value;
}

export function readPopServers(body: unknown): PopServer[] {
  if (!body || typeof body !== "object") return [];
  const list = (body as { servers?: unknown }).servers;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const pop = String(row.server_pop || "").trim();
    if (!pop) return [];
    const names = [row.server_hostname, row.server_name, row.server_shortname, row.server_pop]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return [{ pop, names }];
  });
}
