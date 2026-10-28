const TRUNK_COLLECTIONS: Record<string, string> = {
  DidNumbers: "#Collection(String)",
  EmergencyGeoLocations: "#Collection(Pbx.EmergencyGeoTrunkLocation)",
  Groups: "#Collection(Pbx.UserGroup)",
  InCIDFormatting: "#Collection(Pbx.CIDFormatting)",
  OutCIDFormatting: "#Collection(Pbx.CIDFormatting)",
  PublicInfoGroups: "#Collection(String)",
  ReceiveExtensions: "#Collection(Pbx.Peer)",
  RoutingRules: "#Collection(Pbx.InboundRule)",
  Tags: "#Collection(Pbx.UserTag)",
  TrunkRegTimes: "#Collection(Pbx.Variable)",
};

const GATEWAY_COLLECTIONS: Record<string, string> = {
  Codecs: "#Collection(String)",
  InboundParams: "#Collection(Pbx.GatewayParameterBinding)",
  OutboundParams: "#Collection(Pbx.GatewayParameterBinding)",
  SourceIdentification: "#Collection(Pbx.GatewayParameterBinding)",
  VariableChoices: "#Collection(Pbx.Choice)",
};

export function trunkCreateBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  groupId?: number;
  fillEmptyCollections?: boolean;
}) {
  const body = cleanValue(input.seed || {}) as Record<string, unknown>;
  body["@odata.type"] = text(body["@odata.type"]) || "#Pbx.Trunk";
  body.Name = input.name;
  body.ExternalNumber = input.number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  body.AuthPassword = {
    "@odata.type": "#Pbx.ConcealedPassword",
    ...passwordFields(body.AuthPassword),
    Value: input.password,
  };
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? { ...(body.Gateway as Record<string, unknown>) }
    : {};
  gateway["@odata.type"] = text(gateway["@odata.type"]) || "#Pbx.Gateway";
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  for (const [key, type] of Object.entries(GATEWAY_COLLECTIONS)) {
    const items = collectionItems(gateway[key]);
    if (items.length || input.fillEmptyCollections !== false) gateway[key] = typedCollection(gateway[key], type, items);
    else delete gateway[key];
  }
  body.Gateway = gateway;
  body.DidNumbers = typedCollection(body.DidNumbers, TRUNK_COLLECTIONS.DidNumbers, [input.number]);
  if (input.groupId) {
    body.Groups = typedCollection(body.Groups, TRUNK_COLLECTIONS.Groups, [{ GroupId: input.groupId, Rights: { "@odata.type": "#Pbx.Rights", RoleName: "system" } }]);
  } else if (input.fillEmptyCollections !== false) body.Groups = typedCollection(body.Groups, TRUNK_COLLECTIONS.Groups, collectionItems(body.Groups));
  else delete body.Groups;
  for (const [key, type] of Object.entries(TRUNK_COLLECTIONS)) {
    if (key === "DidNumbers" || key === "Groups") continue;
    const items = collectionItems(body[key]);
    if (items.length || input.fillEmptyCollections !== false) body[key] = typedCollection(body[key], type, items);
    else delete body[key];
  }
  return body;
}

export function wrapCollections(body: Record<string, unknown>, keys: string[]) {
  const next = { ...body };
  for (const key of keys) if (Array.isArray(next[key])) next[key] = { delta: next[key] };
  return next;
}

export function mentionsDelta(message: string) {
  return /delta/i.test(message);
}

function typedCollection(current: unknown, fallbackType: string, items: unknown[]) {
  const record = current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { "@odata.type": text(record["@odata.type"]) || fallbackType, delta: items };
}

function collectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.delta)) return record.delta;
    if (Array.isArray(record.value)) return record.value;
  }
  return [];
}

function passwordFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("@") || key === "delta") continue;
    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") next[key] = child;
  }
  return next;
}

function cleanValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const declared = text(record["@odata.type"]);
  const context = text(record["@odata.context"]);
  if ("delta" in record || /Collection\(/i.test(`${declared} ${context}`)) {
    const items = collectionItems(record).map(cleanValue);
    const next: Record<string, unknown> = { delta: items };
    const type = declared || collectionTypeFromContext(context);
    if (type) next["@odata.type"] = type;
    return next;
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "@odata.type" || key.endsWith("@odata.type")) {
      next[key] = child;
      continue;
    }
    if (key.startsWith("@") || key.includes("@odata.")) continue;
    const cleaned = cleanValue(child);
    if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned as object).length === 0) continue;
    next[key] = cleaned;
  }
  for (const key of Object.keys(next)) {
    if (!key.endsWith("@odata.type")) continue;
    const name = key.slice(0, -"@odata.type".length);
    const type = text(next[key]);
    if (!name || !type || !Array.isArray(next[name])) continue;
    next[name] = { "@odata.type": type.startsWith("#") ? type : `#${type}`, delta: next[name] };
    delete next[key];
  }
  return next;
}

function collectionTypeFromContext(context: string) {
  const match = context.match(/#Collection\([^)]+\)/i) || context.match(/Collection\([^)]+\)/i);
  if (!match) return "";
  return match[0].startsWith("#") ? match[0] : `#${match[0]}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
