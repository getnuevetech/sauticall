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

export function trunkProvisionVerdict(input: { registered: boolean; inbound: boolean; outbound: boolean; callsConfirmed: boolean }) {
  if (!input.registered) return { complete: false, status: "trunk_waiting" as const, reason: "The 3CX trunk is not registered." };
  if (!input.inbound || !input.outbound) return { complete: false, status: "trunk_waiting" as const, reason: "Inbound and outbound routing are not both verified." };
  if (!input.callsConfirmed) return { complete: false, status: "trunk_waiting" as const, reason: "Inbound and outbound test calls have not been confirmed. No call was placed from SautiCall." };
  return { complete: true, status: "trunk_live" as const, reason: "The trunk is registered, both routes are verified, and the test calls were confirmed." };
}

export function readTrunkIdentity(body: unknown) {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const value = record.value && typeof record.value === "object" && !Array.isArray(record.value) ? record.value as Record<string, unknown> : record;
  const id = typeof value.Id === "number" && Number.isInteger(value.Id) ? value.Id : 0;
  const number = value.Number == null ? "" : String(value.Number).replace(/\D/g, "");
  const registered = value.IsOnline === true || value.IsRegistered === true;
  return { id, number, registered };
}

export function redactProvisioning(message: string, secrets: string[]) {
  let text = message;
  for (const secret of secrets) {
    if (secret && secret.length > 3) text = text.split(secret).join("[hidden]");
  }
  return text.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [hidden]").replace(/\s+/g, " ").trim().slice(0, 2000);
}

export function manualTrunkNote(input: {
  company: string;
  did: string;
  dialed: string;
  extension: string;
  from: string;
  to: string;
  account: string;
  host: string;
  reason: string;
  route?: string;
}) {
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 240);
  const host = input.host || "the saved POP";
  const route = input.route || `extension ${input.extension}`;
  return [
    reason,
    `VoIP.ms SIP account ${input.account} at ${host} is ready. 3CX did not accept an automatic trunk, so add it in the 3CX admin.`,
    `Company ${input.company}.`,
    `Name the 3CX trunk ${input.account}. 3CX does not show a trunk id, so enter that name here and SautiCall will read the trunk.`,
    `Registrar ${host}, SIP user ${input.account}. Use the SIP password already stored for this company.`,
    `Main trunk number ${input.dialed}, in national format.`,
    `Route inbound ${input.did} to ${route}.`,
    `Add an outbound rule for this company department, limited to extensions ${input.from}–${input.to}.`,
    "Enter that trunk name on this line. SautiCall will read the trunk and try the inbound and outbound rules. If those are refused too, finish both rules in 3CX and record that the routing was finished there.",
  ].join(" ");
}

export function trunkPlainBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const number = digits(input.number);
  const body = sanitizeTrunk(toPlainArrays(input.seed ? structuredClone(input.seed) : {}), "") as Record<string, unknown>;
  for (const key of OMITTED) delete body[key];
  body.Name = input.name;
  if (number) body.ExternalNumber = number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  body.AuthPassword = { Value: input.password };
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? body.Gateway as Record<string, unknown>
    : {};
  body.Gateway = gateway;
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  if (number) body.DidNumbers = [number];
  return body;
}

function stripTrunkMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTrunkMetadata);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("@odata.") && key !== "@odata.type") continue;
    next[key] = stripTrunkMetadata(child);
  }
  return next;
}

export function trunkPassthroughBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const number = digits(input.number);
  const body = stripTrunkMetadata(input.seed ? structuredClone(input.seed) : {}) as Record<string, unknown>;
  body.Name = input.name;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  body.AuthPassword = { Value: input.password };
  if (number) body.ExternalNumber = number;
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? body.Gateway as Record<string, unknown>
    : {};
  body.Gateway = gateway;
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  if (number) keepDid(body, number);
  return fillNullDeltas(body) as Record<string, unknown>;
}

function keepDid(body: Record<string, unknown>, number: string) {
  const current = body.DidNumbers;
  if (Array.isArray(current)) {
    body.DidNumbers = [number];
    return;
  }
  if (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    if ("delta" in record || "@odata.type" in record) {
      record.delta = [number];
      return;
    }
    if ("value" in record) {
      record.value = [number];
      return;
    }
  }
  body.DidNumbers = [number];
}

export const VOIPMS_TRUNK_TEMPLATE = "voipms.pv.xml";

export function trunkTemplateName(saved: string) {
  const name = saved.trim();
  if (!name || name === "GenericSIPTrunk.pv.xml" || name === "GenericVoIPProvider.pv.xml") return VOIPMS_TRUNK_TEMPLATE;
  return /^[\w.-]+$/.test(name) ? name : VOIPMS_TRUNK_TEMPLATE;
}

export function trunkDialedNumber(did: string) {
  const digitsOnly = did.replace(/\D/g, "");
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return digitsOnly.slice(1);
  return digitsOnly;
}

export function fillNullDeltas(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fillNullDeltas);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) next[key] = fillNullDeltas(child);
  if ("delta" in next && (next.delta === null || next.delta === undefined)) {
    next.delta = Array.isArray(next.value) ? next.value : [];
  }
  return next;
}

export function trunkClientBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const number = digits(input.number);
  const body = input.seed ? structuredClone(input.seed) : {
    "@odata.type": "#Pbx.Trunk",
    Gateway: { "@odata.type": "#Pbx.Gateway", Name: "VoIP.ms", Port: 5060, TemplateFilename: input.template || "GenericSIPTrunk.pv.xml" },
  };
  body.Name = input.name;
  if (number) body.ExternalNumber = number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  body.AuthPassword = { Value: input.password };
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? body.Gateway as Record<string, unknown>
    : {};
  body.Gateway = gateway;
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  if (number) placeDid(body, number);
  return promoteCollections(body) as Record<string, unknown>;
}

export function trunkServiceBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const body = input.seed ? structuredClone(input.seed) : {};
  const number = digits(input.number);
  body.Name = input.name;
  if (number) body.ExternalNumber = number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  const currentPassword = body.AuthPassword;
  if (currentPassword && typeof currentPassword === "object" && !Array.isArray(currentPassword)) {
    (currentPassword as Record<string, unknown>).Value = input.password;
  } else {
    body.AuthPassword = { Value: input.password };
  }
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? body.Gateway as Record<string, unknown>
    : {};
  body.Gateway = gateway;
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  if (number) placeDid(body, number);
  return body;
}

export function trunkSmallBody(input: {
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const number = digits(input.number);
  return {
    "@odata.type": "#Pbx.Trunk",
    Id: 0,
    Name: input.name,
    ExternalNumber: number,
    AuthID: input.authId,
    AuthPassword: { "@odata.type": "#Pbx.ConcealedPassword", Value: input.password },
    EnableInboundCalls: true,
    EnableOutboundCalls: true,
    DidNumbers: number ? [number] : [],
    Gateway: {
      "@odata.type": "#Pbx.Gateway",
      Name: "SIP",
      Host: input.host,
      Port: 5060,
      TemplateFilename: input.template || "GenericSIPTrunk.pv.xml",
      Lines: 1,
      Codecs: ["PCMU", "PCMA", "G729"],
    },
  };
}

const READ_ONLY = new Set(["ConfigurationIssue", "Groups", "IsOnline", "RoutingRules"]);

export function trunkReadyBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const number = digits(input.number);
  const body = normalizeTrunk(input.seed ? structuredClone(input.seed) : {}) as Record<string, unknown>;
  body["@odata.type"] = "#Pbx.Trunk";
  body.Name = input.name;
  if (number) body.ExternalNumber = number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  if (body.UseSeparateAuthId === true) body.SeparateAuthId = input.authId;
  body.AuthPassword = { "@odata.type": "#Pbx.ConcealedPassword", Value: input.password };
  body.EnableInboundCalls = body.EnableInboundCalls !== false;
  body.EnableOutboundCalls = body.EnableOutboundCalls !== false;
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? body.Gateway as Record<string, unknown>
    : {};
  body.Gateway = gateway;
  gateway["@odata.type"] = "#Pbx.Gateway";
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  body.DidNumbers = { "@odata.type": "#Collection(String)", delta: number ? [number] : [] };
  return dropEmptyDeltas(sanitizeTrunk(body, "")) as Record<string, unknown>;
}

const TRUNK_ENUMS: Record<string, Set<string>> = {
  Direction: new Set(["None", "Inbound", "Outbound", "Both"]),
  IPRestriction: new Set(["Any", "IPV4", "IPV6"]),
  TransportRestriction: new Set(["Any", "UDP", "TCP", "TLS"]),
  SRTPMode: new Set(["SRTPDisabled", "SRTPEnabled", "SRTPEnforced"]),
  IPInRegistrationContact: new Set(["External", "Internal", "Both", "Specified"]),
  MatchingStrategy: new Set(["MatchAnyFields", "MatchAllFields"]),
  RequireRegistrationFor: new Set(["Nothing", "IncomingCalls", "OutgoingCalls", "InOutCalls"]),
  Type: new Set(["Unknown", "Analog", "Provider", "BridgeMaster", "BridgeSlave", "BridgeSlaveOverTunnel", "BRI", "T1", "E1"]),
};

export function trunkLeanBody(ready: Record<string, unknown>) {
  const gateway = ready.Gateway && typeof ready.Gateway === "object" && !Array.isArray(ready.Gateway)
    ? ready.Gateway as Record<string, unknown>
    : {};
  const nextGateway: Record<string, unknown> = {
    "@odata.type": "#Pbx.Gateway",
    Name: gateway.Name || "VoIP.ms",
    Host: gateway.Host || "",
    Port: gateway.Port || 5060,
    TemplateFilename: gateway.TemplateFilename || "",
    Lines: gateway.Lines || 1,
  };
  for (const key of ["Codecs", "InboundParams", "OutboundParams", "SourceIdentification"]) {
    if (gateway[key]) nextGateway[key] = gateway[key];
  }
  const body: Record<string, unknown> = {
    "@odata.type": "#Pbx.Trunk",
    Name: ready.Name,
    ExternalNumber: ready.ExternalNumber,
    AuthID: ready.AuthID,
    AuthPassword: ready.AuthPassword,
    EnableInboundCalls: true,
    EnableOutboundCalls: true,
    DidNumbers: ready.DidNumbers,
    Gateway: nextGateway,
  };
  if (typeof ready.Number === "string" && ready.Number.trim()) body.Number = ready.Number;
  return dropEmptyDeltas(body) as Record<string, unknown>;
}

export function trunkFailureText(failures: string[], shape: string) {
  const errors = failures.filter(Boolean).map((item) => item.replace(/\s+/g, " ").trim().slice(0, 220)).join(" | ");
  return `${errors} | shape ${shape.slice(0, 420)}`;
}

export function trunkArrayBody(body: Record<string, unknown>) {
  return unwrapDeltas(structuredClone(body)) as Record<string, unknown>;
}

export function trunkReplayBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  template?: string;
}) {
  const body = input.seed ? structuredClone(input.seed) : {};
  ensureDeltas(body);
  const number = digits(input.number);
  body.Name = input.name;
  if (number) body.ExternalNumber = number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  const currentPassword = body.AuthPassword;
  const passwordType = currentPassword && typeof currentPassword === "object" && !Array.isArray(currentPassword)
    ? text((currentPassword as Record<string, unknown>)["@odata.type"])
    : "";
  body.AuthPassword = passwordType ? { "@odata.type": passwordType, Value: input.password } : { Value: input.password };
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? body.Gateway as Record<string, unknown>
    : {};
  body.Gateway = gateway;
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  if (number) replaceDid(body, number);
  cleanLinks(body);
  return body;
}

export function trunkDeltaLists(body: Record<string, unknown>) {
  return wrapValue(structuredClone(body)) as Record<string, unknown>;
}

export function trunkFilledDeltas(body: Record<string, unknown>) {
  return dropEmptyDeltas(trunkDeltaLists(body)) as Record<string, unknown>;
}

const DROP_KEYS = new Set(["ConfigurationIssue", "IsOnline"]);
const MESSAGING_KEYS = new Set(["@odata.type", "Enabled", "NumberLength", "NumberLengthEnabled", "Provider", "Webhook"]);
const BLANK_KEYS = new Set([
  "Certificate",
  "CertificateExpirationDate",
  "CertificateName",
  "Direction",
  "E164CountryCode",
  "IPInRegistrationContact",
  "IPRestriction",
  "MatchingStrategy",
  "OutboundCallerID",
  "Provider",
  "ProxyHost",
  "PublicIPinSIP",
  "RemoteMyPhoneUriHost",
  "RemotePBXPreffix",
  "RequireRegistrationFor",
  "SRTPMode",
  "ScriptName",
  "SecondaryRegistrar",
  "SeparateAuthId",
  "SpecifiedIPForRegistrationContact",
  "TransportRestriction",
  "TunnelRemoteAddr",
  "Type",
  "Webhook",
]);

export const trunkContentTypes = [
  ["odata", "application/json;odata.metadata=minimal;odata.streaming=true;IEEE754Compatible=false"],
  ["minimal", "application/json;odata.metadata=minimal"],
  ["charset", "application/json;odata.metadata=minimal;odata.streaming=true;IEEE754Compatible=false;charset=utf-8"],
] as const;

export function trunkPostBody(body: Record<string, unknown>) {
  return sanitizeTrunk(structuredClone(body), "") as Record<string, unknown>;
}

export function omittedTrunkFields(body: Record<string, unknown>) {
  const names: string[] = [];
  collectOmitted(body, "", names);
  return names.slice(0, 12);
}

function sanitizeTrunk(value: unknown, key: string): unknown {
  if (typeof value === "string") {
    if (value.trim() === "" && BLANK_KEYS.has(key)) return undefined;
    if (TRUNK_ENUMS[key] && !TRUNK_ENUMS[key].has(value)) return undefined;
    if (key === "ExternalNumber" || key === "OutboundCallerID" || key === "E164CountryCode") {
      const next = value.replace(/\D/g, "");
      return next || undefined;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeTrunk(item, "")).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(record)) {
    if (DROP_KEYS.has(childKey)) continue;
    if (key === "Messaging" && !MESSAGING_KEYS.has(childKey)) continue;
    const copied = sanitizeTrunk(child, childKey);
    if (copied !== undefined) next[childKey] = copied;
  }
  return next;
}

function collectOmitted(value: unknown, key: string, names: string[]) {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [childKey, child] of Object.entries(record)) {
    if (childKey === "AuthPassword") continue;
    if (DROP_KEYS.has(childKey) || (key === "Messaging" && !MESSAGING_KEYS.has(childKey)) || (typeof child === "string" && child.trim() === "" && BLANK_KEYS.has(childKey))) {
      names.push(childKey);
    }
    collectOmitted(child, childKey, names);
  }
}

export function trunkShape(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "AuthPassword").map(([key, child]) => fieldShape(key, child)).join(",");
}

function wrapValue(value: unknown): unknown {
  if (Array.isArray(value)) return { delta: value.map(wrapValue) };
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.delta)) return { ...record, delta: record.delta.map(wrapValue) };
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) next[key] = wrapValue(child);
  return next;
}

function dropEmptyDeltas(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropEmptyDeltas).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.delta) && record.delta.length === 0) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "delta" && Array.isArray(child)) {
      next[key] = child.map(dropEmptyDeltas).filter((item) => item !== undefined);
      continue;
    }
    const copied = dropEmptyDeltas(child);
    if (copied !== undefined) next[key] = copied;
  }
  return next;
}

function fieldShape(key: string, child: unknown): string {
  if (Array.isArray(child)) return `${key}:array(${child.length})`;
  if (child && typeof child === "object") {
    const record = child as Record<string, unknown>;
    if (Array.isArray(record.delta)) return `${key}:delta(${record.delta.length})`;
    if (key === "Gateway" || key === "Messaging") return `${key}{${trunkShape(record)}}`;
    return `${key}:object`;
  }
  return `${key}:${typeof child}`;
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

function toPlainArrays(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toPlainArrays);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (needsDelta(record) || Array.isArray(record.delta)) return collectionItems(record).map(toPlainArrays);
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("@") || key.includes("@odata.")) continue;
    const copied = toPlainArrays(child);
    if (copied !== undefined) next[key] = copied;
  }
  return next;
}

function promoteCollections(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(promoteCollections);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (needsDelta(record)) {
    const items = collectionItems(record).map(promoteCollections);
    const type = collectionType(record);
    const next: Record<string, unknown> = {};
    if (type) next["@odata.type"] = type;
    next.delta = items;
    return next;
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key !== "@odata.type" && (key.startsWith("@") || key.includes("@odata."))) continue;
    const copied = promoteCollections(child);
    if (Array.isArray(copied) && COLLECTION_TYPES[key]) {
      next[key] = { "@odata.type": COLLECTION_TYPES[key], delta: copied };
      continue;
    }
    if (copied !== undefined) next[key] = copied;
  }
  return next;
}

function needsDelta(record: Record<string, unknown>) {
  const type = `${text(record["@odata.type"])} ${text(record["@odata.context"])}`;
  if (/Collection\(/i.test(type)) return true;
  return Array.isArray(record.value) && ("@odata.context" in record || "@odata.type" in record);
}

function collectionType(record: Record<string, unknown>) {
  const explicit = text(record["@odata.type"]);
  if (/Collection\(/i.test(explicit)) return explicit.startsWith("#") ? explicit : `#${explicit}`;
  const match = text(record["@odata.context"]).match(/#(Collection\([^)]+\))/);
  return match ? `#${match[1]}` : "";
}

function collectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as { delta?: unknown; value?: unknown };
  if (Array.isArray(record.delta)) return record.delta;
  if (Array.isArray(record.value)) return record.value;
  return [];
}

function normalizeTrunk(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return collectionRecord(key, value.map((item) => normalizeTrunk(item, "")));
  if (value === null || value === undefined || typeof value !== "object") {
    if (typeof value === "string" && value.trim() === "" && BLANK_KEYS.has(key)) return undefined;
    if ((key === "ExternalNumber" || key === "OutboundCallerID" || key === "E164CountryCode") && typeof value === "string") {
      const next = digits(value);
      return next || undefined;
    }
    return value;
  }
  const record = value as Record<string, unknown>;
  if (isCollection(record) || COLLECTION_TYPES[key]) return collectionRecord(key, collectionItems(record).map((item) => normalizeTrunk(item, "")));
  const next: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(record)) {
    if ((childKey.startsWith("@") && childKey !== "@odata.type") || READ_ONLY.has(childKey)) continue;
    if (child === null || child === undefined) continue;
    const copied = normalizeTrunk(child, childKey);
    if (copied !== undefined) next[childKey] = copied;
  }
  return next;
}

function collectionRecord(key: string, items: unknown[]) {
  const type = COLLECTION_TYPES[key] || "#Collection(String)";
  const itemType = GATEWAY_ITEM_TYPES[key] || TRUNK_ITEM_TYPES[key] || "";
  const delta = itemType ? tagItems(items, itemType) : items;
  return { "@odata.type": type, delta };
}

function unwrapDeltas(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapDeltas);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.delta)) return record.delta.map(unwrapDeltas);
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("@") && key !== "@odata.type") continue;
    next[key] = unwrapDeltas(child);
  }
  return next;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function ensureDeltas(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(ensureDeltas);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (isCollection(record) && !Array.isArray(record.delta)) record.delta = [];
  for (const child of Object.values(record)) ensureDeltas(child);
}

function placeDid(body: Record<string, unknown>, number: string) {
  const current = body.DidNumbers;
  if (Array.isArray(current)) {
    body.DidNumbers = [number];
    return;
  }
  if (current && typeof current === "object") {
    (current as Record<string, unknown>).delta = [number];
    return;
  }
  body.DidNumbers = [number];
}

function replaceDid(body: Record<string, unknown>, number: string) {
  const current = body.DidNumbers;
  if (Array.isArray(current)) {
    body.DidNumbers = [number];
    return;
  }
  if (current && typeof current === "object" && isCollection(current as Record<string, unknown>)) {
    (current as Record<string, unknown>).delta = [number];
    return;
  }
  body.DidNumbers = [number];
}

function cleanLinks(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(cleanLinks);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "@odata.type" && !key.endsWith("@odata.type") && (key.startsWith("@") || key.includes("@odata."))) delete record[key];
    else cleanLinks(record[key]);
  }
}
