export function trunkCreateBody(input: {
  seed: Record<string, unknown> | null;
  name: string;
  number: string;
  authId: string;
  password: string;
  host: string;
  groupId?: number;
}) {
  const body: Record<string, unknown> = { ...(input.seed || {}) };
  body.Name = input.name;
  body.ExternalNumber = input.number;
  body.AuthID = input.authId;
  if ("AuthUser" in body) body.AuthUser = input.authId;
  const password = body.AuthPassword;
  body.AuthPassword = password && typeof password === "object" && !Array.isArray(password)
    ? { ...(password as Record<string, unknown>), Value: input.password }
    : { Value: input.password };
  const gateway: Record<string, unknown> = body.Gateway && typeof body.Gateway === "object" && !Array.isArray(body.Gateway)
    ? { ...(body.Gateway as Record<string, unknown>) }
    : { Name: "VoIP.ms", Type: "Provider" };
  if (input.host) gateway.Host = input.host;
  if (!gateway.Port) gateway.Port = 5060;
  if (!gateway.Name) gateway.Name = "VoIP.ms";
  body.Gateway = gateway;
  if ("Host" in body && input.host) body.Host = input.host;
  body.DidNumbers = withDelta(body.DidNumbers, [input.number]);
  if (input.groupId) {
    body.Groups = withDelta(body.Groups, [{ GroupId: input.groupId, Rights: { RoleName: "system" } }]);
  }
  return body;
}

export function trunkArrayBody(body: Record<string, unknown>) {
  const next = { ...body };
  for (const key of ["DidNumbers", "Groups"]) {
    const value = next[key];
    if (value && typeof value === "object" && !Array.isArray(value) && "delta" in value) {
      next[key] = (value as { delta: unknown }).delta;
    }
  }
  const password = next.AuthPassword;
  if (password && typeof password === "object" && !Array.isArray(password) && "Value" in password) {
    next.AuthPassword = (password as { Value: unknown }).Value;
  }
  return next;
}

export function wrapCollections(body: Record<string, unknown>, keys: string[]) {
  const next = { ...body };
  for (const key of keys) {
    if (Array.isArray(next[key])) next[key] = { delta: next[key] };
  }
  return next;
}

export function mentionsDelta(message: string) {
  return /delta/i.test(message);
}

function withDelta(current: unknown, items: unknown[]) {
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return { ...(current as Record<string, unknown>), delta: items };
  }
  return { delta: items };
}
