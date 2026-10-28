const OMITTED = new Set(["ConfigurationIssue", "Groups", "IsOnline", "RoutingRules"]);

const GATEWAY_ITEM_TYPES: Record<string, string> = {
  InboundParams: "#Pbx.GatewayParameterBinding",
  OutboundParams: "#Pbx.GatewayParameterBinding",
  SourceIdentification: "#Pbx.GatewayParameterBinding",
  VariableChoices: "#Pbx.Choice",
};

const TRUNK_ITEM_TYPES: Record<string, string> = {
  EmergencyGeoLocations: "#Pbx.EmergencyGeoTrunkLocation",
  InCIDFormatting: "#Pbx.CIDFormatting",
  OutCIDFormatting: "#Pbx.CIDFormatting",
  ReceiveExtensions: "#Pbx.Peer",
  Tags: "#Pbx.UserTag",
  TrunkRegTimes: "#Pbx.Variable",
};

const COLLECTION_TYPES: Record<string, string> = {
  Codecs: "#Collection(String)",
  DidNumbers: "#Collection(String)",
  EmergencyGeoLocations: "#Collection(Pbx.EmergencyGeoTrunkLocation)",
  InCIDFormatting: "#Collection(Pbx.CIDFormatting)",
  InboundParams: "#Collection(Pbx.GatewayParameterBinding)",
  OutCIDFormatting: "#Collection(Pbx.CIDFormatting)",
  OutboundParams: "#Collection(Pbx.GatewayParameterBinding)",
  PublicInfoGroups: "#Collection(String)",
  ReceiveExtensions: "#Collection(Pbx.Peer)",
  SourceIdentification: "#Collection(Pbx.GatewayParameterBinding)",
  Tags: "#Collection(Pbx.UserTag)",
  TrunkRegTimes: "#Collection(Pbx.Variable)",
  VariableChoices: "#Collection(Pbx.Choice)",
};

export function trunkCreateBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const number = digits(input.number);
  const body = plain(input.seed || {}) as Record<string, unknown>;
  for (const key of OMITTED) delete body[key];
  body["@odata.type"] = "#Pbx.Trunk";
  body.Name = input.name;
  body.ExternalNumber = number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  if ("SeparateAuthId" in body || body.UseSeparateAuthId === true) body.SeparateAuthId = input.authId;
  body.AuthPassword = { "@odata.type": "#Pbx.ConcealedPassword", Value: input.password };
  digitField(body, "OutboundCallerID");
  digitField(body, "E164CountryCode");
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? { ...(body.Gateway as Record<string, unknown>) }
    : {};
  gateway["@odata.type"] = "#Pbx.Gateway";
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  digitField(gateway, "OutboundCallerID");
  for (const [key, type] of Object.entries(GATEWAY_ITEM_TYPES)) {
    if (Array.isArray(gateway[key])) gateway[key] = tagItems(gateway[key], type);
  }
  body.Gateway = gateway;
  for (const [key, type] of Object.entries(TRUNK_ITEM_TYPES)) {
    if (Array.isArray(body[key])) body[key] = tagItems(body[key], type);
  }
  if (body.Messaging && typeof body.Messaging === "object" && !Array.isArray(body.Messaging)) {
    body.Messaging = { "@odata.type": "#Pbx.TrunkMessaging", ...(body.Messaging as Record<string, unknown>) };
  }
  body.DidNumbers = number ? [number] : [];
  return body;
}

export function trunkDeltaBody(body: Record<string, unknown>) {
  const next = { ...body };
  wrap(next);
  if (next.Gateway && typeof next.Gateway === "object" && !Array.isArray(next.Gateway)) {
    const gateway = { ...(next.Gateway as Record<string, unknown>) };
    wrap(gateway);
    next.Gateway = gateway;
  }
  return next;
}

export function trunkGroupBody(groupId: number) {
  return {
    Groups: [{
      "@odata.type": "#Pbx.UserGroup",
      GroupId: groupId,
      Id: 0,
      Rights: { "@odata.type": "#Pbx.Rights", RoleName: "system" },
    }],
  };
}

export function wrapCollections(body: Record<string, unknown>, keys: string[]) {
  const next = { ...body };
  for (const key of keys) if (Array.isArray(next[key])) next[key] = { delta: next[key] };
  return next;
}

export function mentionsDelta(message: string) {
  return /delta/i.test(message);
}

function wrap(record: Record<string, unknown>) {
  for (const [key, type] of Object.entries(COLLECTION_TYPES)) {
    if (Array.isArray(record[key])) record[key] = { "@odata.type": type, delta: record[key] };
  }
}

function tagItems(value: unknown, type: string) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const record = { ...(item as Record<string, unknown>) };
    delete record["@odata.type"];
    return { "@odata.type": type, ...record };
  });
}

function digitField(record: Record<string, unknown>, key: string) {
  if (typeof record[key] !== "string") return;
  const next = digits(record[key]);
  if (next) record[key] = next;
  else delete record[key];
}

function digits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain).filter(present);
  if (value === null || value === undefined || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (isCollection(record)) return plain(collectionItems(record));
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("@") || key.includes("@odata.")) continue;
    if (child === null || child === undefined) continue;
    const copied = plain(child);
    if (!present(copied)) continue;
    if (Array.isArray(copied) && copied.length === 0) continue;
    if (typeof copied === "object" && !Array.isArray(copied) && Object.keys(copied as object).length === 0) continue;
    next[key] = copied;
  }
  return next;
}

function present(value: unknown) {
  return value !== undefined && value !== null;
}

function isCollection(record: Record<string, unknown>) {
  if ("delta" in record) return true;
  return /Collection\(/i.test(`${text(record["@odata.type"])} ${text(record["@odata.context"])}`);
}

function collectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { delta?: unknown }).delta)) return (value as { delta: unknown[] }).delta;
  return [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
