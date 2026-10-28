export function trunkCreateBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  groupId?: number;
  template?: string;
}) {
  const body = copyValue(input.seed || {}) as Record<string, unknown>;
  body.Name = input.name;
  body.ExternalNumber = input.number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  if ("SeparateAuthId" in body || body.UseSeparateAuthId === true) body.SeparateAuthId = input.authId;
  body.AuthPassword = passwordValue(body.AuthPassword, input.password);
  const gateway = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? { ...(body.Gateway as Record<string, unknown>) }
    : {};
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  if (!gateway.TemplateFilename && input.template) gateway.TemplateFilename = input.template;
  body.Gateway = gateway;
  body.DidNumbers = addItem(body.DidNumbers, input.number, (item) => item === input.number);
  if (input.groupId) {
    body.Groups = addItem(body.Groups, { GroupId: input.groupId, Rights: { RoleName: "system" } }, (item) => {
      return Boolean(item && typeof item === "object" && (item as { GroupId?: unknown }).GroupId === input.groupId);
    });
  }
  return body;
}

export function trunkAsArrays(body: Record<string, unknown>) {
  return arrays(body) as Record<string, unknown>;
}

export function wrapCollections(body: Record<string, unknown>, keys: string[]) {
  const next = { ...body };
  for (const key of keys) if (Array.isArray(next[key])) next[key] = { delta: next[key] };
  return next;
}

export function mentionsDelta(message: string) {
  return /delta/i.test(message);
}

function passwordValue(current: unknown, password: string) {
  if (!current || typeof current !== "object" || Array.isArray(current)) return { Value: password };
  const next: Record<string, unknown> = { ...(current as Record<string, unknown>), Value: password };
  delete next.delta;
  return next;
}

function addItem(current: unknown, item: unknown, same: (existing: unknown) => boolean) {
  if (Array.isArray(current)) {
    if (!current.some(same)) current.push(item);
    return current;
  }
  if (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    const items = Array.isArray(record.delta) ? [...record.delta] : [];
    if (!items.some(same)) items.push(item);
    return { ...record, delta: items };
  }
  return [item];
}

function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (isCollection(record)) {
    const next: Record<string, unknown> = { delta: collectionItems(record).map(copyValue) };
    const type = text(record["@odata.type"]);
    if (type) next["@odata.type"] = type;
    return next;
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key !== "@odata.type" && !key.endsWith("@odata.type") && (key.startsWith("@") || key.includes("@odata."))) continue;
    const copied = copyValue(child);
    if (copied && typeof copied === "object" && !Array.isArray(copied) && Object.keys(copied as object).length === 0) continue;
    next[key] = copied;
  }
  return next;
}

function arrays(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(arrays);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if ("delta" in record) return (Array.isArray(record.delta) ? record.delta : []).map(arrays);
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("@")) continue;
    next[key] = arrays(child);
  }
  return next;
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
