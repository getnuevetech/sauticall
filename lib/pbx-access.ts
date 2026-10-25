export function roleFromToken(token: string) {
  const part = token.split(".")[1] || "";
  if (!part) return "";
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    const role = json.MaxRole || json.role;
    if (typeof role === "string") return role;
    if (Array.isArray(role) && typeof role[0] === "string") return role[0];
    return "";
  } catch {
    return "";
  }
}

export function pbxAccessMessage(status: number, role: string, detail: string) {
  if (status !== 403) return detail || `3CX answered ${status}.`;
  const extra = detail && !/access denied/i.test(detail) ? ` ${detail}` : "";
  const limited = role && role !== "system_owners" && role !== "system_admins";
  if (limited) {
    return `3CX signed this client in as ${role.replace(/_/g, " ")}, then refused the call.${extra} In 3CX Admin, open Integrations, then API. Choose the default department and set the role to System Owner. System-wide leaves the role as User, and 3CX answers 403.`;
  }
  return `3CX refused this API client.${extra} In Integrations, API, choose the default department and the System Owner role, and allow this server under console restrictions.`;
}

export function adminPbxError(status: number, role: string, code: string, detail: string) {
  const raw = detail.replace(/\s+/g, " ").trim();
  const head = `3CX returned ${status}${code ? ` (${code})` : ""}${raw ? `: ${raw}` : "."}`;
  if (status !== 403) return head;
  return `${head} ${pbxAccessMessage(403, role, "")}`;
}

export function describeExtensionFailure(input: {
  number: string;
  status: number;
  code: string;
  detail: string;
  role: string;
  existing?: { email: string } | null;
  lookupFailed?: string;
}) {
  const collision = /ALREADY_IN_USE|already exists|already in use/i.test(`${input.code} ${input.detail}`);
  let existence: string;
  if (input.existing || collision) {
    const email = input.existing?.email ? ` for ${input.existing.email}` : "";
    existence = `Extension ${input.number} already exists on 3CX${email}.`;
  } else if (input.existing === null) {
    existence = `Extension ${input.number} was not found on 3CX.`;
  } else {
    existence = `SautiCall could not check whether extension ${input.number} already exists on 3CX${input.lookupFailed ? `: ${input.lookupFailed}` : "."}`;
  }
  return `${existence} ${adminPbxError(input.status, input.role, input.code, input.detail)}`;
}
