const TRUNK_FIELDS = [
  "Direction",
  "DisableCallTransfer",
  "DisableVideo",
  "DiversionHeader",
  "E164CountryCode",
  "E164ProcessIncomingNumber",
  "EnableInboundCalls",
  "EnableOutboundCalls",
  "IPRestriction",
  "OutboundCallerID",
  "PublicIPinSIP",
  "PublishInfo",
  "ReceiveInfo",
  "RemoteMyPhoneUriHost",
  "RemotePBXPreffix",
  "SecondaryRegistrar",
  "SeparateAuthId",
  "SimultaneousCalls",
  "TransportRestriction",
  "TunnelEnabled",
  "TunnelRemoteAddr",
  "TunnelRemotePort",
  "UseSeparateAuthId",
];

const GATEWAY_FIELDS = [
  "DeliverAudio",
  "DestNumberInRemotePartyIDCalled",
  "DestNumberInRequestLineURI",
  "DestNumberInTo",
  "IPInRegistrationContact",
  "Internal",
  "Lines",
  "MatchingStrategy",
  "Name",
  "OutboundCallerID",
  "Port",
  "ProxyHost",
  "ProxyPort",
  "RequireRegistrationFor",
  "SRTPMode",
  "SpecifiedIPForRegistrationContact",
  "SupportReinvite",
  "SupportReplaces",
  "TemplateFilename",
  "TimeBetweenReg",
  "Type",
  "UseIPInContact",
];

const LIST_FIELDS = ["Codecs", "InboundParams", "OutboundParams", "SourceIdentification", "VariableChoices"];

export function trunkCreateBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  groupId?: number;
  includeGatewayLists?: boolean;
}) {
  const seed = input.seed || {};
  const gatewaySeed = seed.Gateway && typeof seed.Gateway === "object" && !Array.isArray(seed.Gateway)
    ? seed.Gateway as Record<string, unknown>
    : {};
  const gateway = scalars(gatewaySeed, GATEWAY_FIELDS);
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  if (input.includeGatewayLists !== false) {
    const codecs = listItems(gatewaySeed.Codecs).filter((item): item is string => typeof item === "string");
    if (codecs.length) gateway.Codecs = codecs;
    for (const key of LIST_FIELDS) {
      if (key === "Codecs") continue;
      const items = listItems(gatewaySeed[key]).map(cleanBinding).filter((item): item is Record<string, unknown> => Boolean(item));
      if (items.length) gateway[key] = items;
    }
  }
  const body: Record<string, unknown> = {
    ...scalars(seed, TRUNK_FIELDS),
    Name: input.name,
    ExternalNumber: input.number,
    AuthID: input.authId,
    AuthPassword: { Value: input.password },
    Gateway: gateway,
    DidNumbers: [input.number],
  };
  if ("AuthUser" in seed) body.AuthUser = input.authId;
  if (input.groupId) body.Groups = [{ GroupId: input.groupId, Rights: { RoleName: "system" } }];
  return body;
}

export function trunkCollectionBody(body: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) next[key] = { delta: value };
    else if (value && typeof value === "object") next[key] = trunkCollectionBody(value as Record<string, unknown>);
    else next[key] = value;
  }
  return next;
}

export function wrapCollections(body: Record<string, unknown>, keys: string[]) {
  const next = { ...body };
  for (const key of keys) if (Array.isArray(next[key])) next[key] = { delta: next[key] };
  return next;
}

export function mentionsDelta(message: string) {
  return /delta/i.test(message);
}

function scalars(record: Record<string, unknown>, keys: string[]) {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") next[key] = value;
  }
  return next;
}

function listItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.delta)) return record.delta;
    if (Array.isArray(record.value)) return record.value;
  }
  return [];
}

function cleanBinding(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  if (typeof record.ParamId === "number") next.ParamId = record.ParamId;
  if (typeof record.ValueId === "number") next.ValueId = record.ValueId;
  if (typeof record.Custom === "string") next.Custom = record.Custom;
  if (typeof record.Key === "string") next.Key = record.Key;
  if (typeof record.Value === "string" || typeof record.Value === "number") next.Value = record.Value;
  return Object.keys(next).length ? next : null;
}
