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

export function pbxErrorText(body: unknown, fallback: string) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : record;
  const code = typeof nested.code === "string" ? nested.code : "";
  const messages: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) messages.push(value.replace(/\s+/g, " ").trim());
  };
  add(nested.message);
  add(record.Message);
  const odata = record["odata.error"];
  if (odata && typeof odata === "object") {
    const message = (odata as { message?: unknown }).message;
    if (typeof message === "string") add(message);
    else if (message && typeof message === "object") add((message as { value?: unknown }).value);
  }
  const model = record.ModelState || nested.ModelState;
  if (model && typeof model === "object") {
    for (const value of Object.values(model as Record<string, unknown>)) {
      if (Array.isArray(value)) value.forEach(add);
      else add(value);
    }
  }
  const message = [...new Set(messages)].join(" ").slice(0, 800);
  return { code, message: message || fallback.replace(/\s+/g, " ").trim().slice(0, 800) };
}

export function numberAlreadyUsed(code: string, detail: string, status = 0) {
  if (status === 409) return true;
  return /ALREADY_IN_USE|already exists|already in use|already used|already assigned|already taken|already been|number is in use|\bused by\b|is not unique|must be unique|duplicate|objectalreadyexists|\bdn already\b|extension already/i.test(`${code} ${detail}`);
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
  const collision = numberAlreadyUsed(input.code, input.detail, input.status);
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
