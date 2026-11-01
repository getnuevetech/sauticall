export function extensionReady(input: { paid: boolean; emailVerified: boolean; phoneVerified: boolean; emailRequired: boolean; smsRequired: boolean }) {
  if (!input.paid) return false;
  if (input.emailRequired && !input.emailVerified) return false;
  if (input.smsRequired && !input.phoneVerified) return false;
  return true;
}

export function signupPersonName(fullName: string) {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const first = (parts[0] || "Owner").slice(0, 40);
  const last = (parts.slice(1).join(" ") || "Owner").slice(0, 40);
  return { first, last };
}

export function trunkNameFromAccount(account: string) {
  const name = account.trim();
  return /^[A-Za-z0-9_]{3,40}$/.test(name) ? name : "";
}

export function nationalTestNumber(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : "";
}

export function defaultInbound(input: { ai: boolean; extension: string; ringGroup: string }) {
  if (input.ai && input.extension) return { to: "Extension" as const, number: input.extension, label: `AI extension ${input.extension}` };
  if (input.ringGroup) return { to: "RingGroup" as const, number: input.ringGroup, label: `ring group ${input.ringGroup}` };
  if (input.extension) return { to: "Extension" as const, number: input.extension, label: `extension ${input.extension}` };
  return null;
}

export function inboundRuleBody(input: { name: string; did: string; trunkId: number; to: "Extension" | "RingGroup"; number: string }) {
  const destination = { To: input.to, Number: input.number, External: "" };
  return {
    Name: input.name,
    DID: input.did,
    TrunkId: input.trunkId,
    OfficeHoursDestination: destination,
    OutOfOfficeHoursDestination: destination,
  };
}

export function trunkTestReady(input: { trunkId: number; routes: boolean; registered: boolean; extensionOnPhoneSystem: boolean }) {
  return input.trunkId > 0 && input.routes && input.registered && input.extensionOnPhoneSystem;
}

function hideSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideSecrets);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "AuthPassword" && child && typeof child === "object") {
      next[key] = { ...(child as Record<string, unknown>), Value: "[hidden]" };
      continue;
    }
    if (/password|secret|token/i.test(key) && typeof child === "string") {
      next[key] = "[hidden]";
      continue;
    }
    next[key] = hideSecrets(child);
  }
  return next;
}

export function trunkWriteRequest(input: { origin: string; body: Record<string, unknown> }) {
  const origin = input.origin.replace(/\/$/, "") || "https://{3cx-host}";
  return {
    method: "POST" as const,
    endpoint: `${origin}/xapi/v1/Trunks`,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-Version": "4.0",
      Prefer: "return=representation",
      Authorization: "Bearer [hidden]",
    },
    body: hideSecrets(input.body) as Record<string, unknown>,
  };
}
