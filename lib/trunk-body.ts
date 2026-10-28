const ARRAY_KEYS = new Set([
  "DidNumbers",
  "EmergencyGeoLocations",
  "InCIDFormatting",
  "OutCIDFormatting",
  "PublicInfoGroups",
  "ReceiveExtensions",
  "RoutingRules",
  "Tags",
  "TrunkRegTimes",
  "Groups",
  "Codecs",
  "InboundParams",
  "OutboundParams",
  "SourceIdentification",
  "VariableChoices",
]);

export function trunkCreateBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  groupId?: number;
}) {
  const body = keepDelta(input.seed || {}) as Record<string, unknown>;
  body.Name = input.name;
  body.ExternalNumber = input.number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  const password = body.AuthPassword;
  body.AuthPassword = password && typeof password === "object" && !Array.isArray(password)
    ? { ...(password as Record<string, unknown>), Value: input.password }
    : { Value: input.password };
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? { ...(body.Gateway as Record<string, unknown>) }
    : {};
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  body.Gateway = gateway;
  body.DidNumbers = asDelta(replaceItems(body.DidNumbers, [input.number]));
  if (input.groupId) body.Groups = asDelta(replaceItems(body.Groups, [{ GroupId: input.groupId, Rights: { RoleName: "system" } }]));
  return body;
}

export function trunkDeltaBody(body: Record<string, unknown>) {
  return { delta: body };
}

export function wrapCollections(body: Record<string, unknown>, keys: string[]) {
  const next = { ...body };
  for (const key of keys) if (Array.isArray(next[key])) next[key] = { delta: next[key] };
  return next;
}

export function mentionsDelta(message: string) {
  return /delta/i.test(message);
}

export function keepDelta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keepDelta);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (isDeltaRecord(record)) {
    const items = Array.isArray(record.delta) ? record.delta.map(keepDelta) : Array.isArray(record.value) ? record.value.map(keepDelta) : [];
    return { delta: items };
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("@")) continue;
    next[key] = ARRAY_KEYS.has(key) ? asDelta(child) : keepDelta(child);
  }
  return next;
}

function replaceItems(current: unknown, items: unknown[]) {
  if (current && typeof current === "object" && !Array.isArray(current) && "delta" in current) return { delta: items };
  return items;
}

function asDelta(value: unknown) {
  const kept = keepDelta(value);
  if (Array.isArray(kept)) return { delta: kept };
  if (kept && typeof kept === "object" && "delta" in kept) return kept;
  return { delta: [] };
}

function isDeltaRecord(record: Record<string, unknown>) {
  if ("delta" in record) return true;
  const marker = `${record["@odata.type"] || ""} ${record["@odata.context"] || ""}`;
  return /Collection\(/i.test(marker);
}
