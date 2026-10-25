const LICENSE_ROLES = new Set(["app", "local", "singlecompany", "multicompany", "paid", "enterprise", "professional", "pro", "callflowapp", "cfd", "hosted"]);
const DEPARTMENT_ROLES = ["system_owners", "system_admins", "owners", "admins", "group_owners", "group_admins", "managers", "receptionists", "users"];
const ADMIN_ROLES = new Set(["system_owners", "system_admins"]);

function claimValues(value: unknown) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export function roleFromToken(token: string) {
  const part = token.split(".")[1] || "";
  if (!part) return "";
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    const values = [...claimValues(json.MaxRole), ...claimValues(json.maxRole), ...claimValues(json.role)];
    for (const [key, value] of Object.entries(json)) {
      if (/role$/i.test(key)) values.push(...claimValues(value));
    }
    const normalized = values.map((value) => value.trim()).filter(Boolean);
    const department = normalized.find((value) => DEPARTMENT_ROLES.includes(value.toLowerCase()));
    if (department) return department;
    return normalized.find((value) => !LICENSE_ROLES.has(value.toLowerCase())) || "";
  } catch {
    return "";
  }
}

export function pbxRoleIsAdmin(role: string) {
  return ADMIN_ROLES.has(role.toLowerCase());
}

function roleLabel(role: string) {
  const key = role.toLowerCase();
  if (key === "system_owners") return "System Owner";
  if (key === "system_admins") return "System Admin";
  if (key === "owners" || key === "group_owners") return "Owner";
  if (key === "users") return "User";
  return role.replace(/_/g, " ");
}

export function pbxAccessMessage(status: number, role: string, detail: string) {
  if (status !== 403) return detail || `3CX answered ${status}.`;
  const extra = detail && !/access denied/i.test(detail) ? ` ${detail}` : "";
  if (pbxRoleIsAdmin(role)) {
    return `3CX refused this API client even though the token is ${roleLabel(role)}.${extra} In 3CX Admin, open Advanced, then Console Restrictions, and choose Allow access from everywhere.`;
  }
  const signed = role
    ? `3CX signed this client in as ${roleLabel(role)}, then refused the call.`
    : "3CX accepted this client, then refused the call. The token has no System Owner role.";
  return `${signed}${extra} In 3CX Admin, open Integrations, then API. Turn on 3CX Configuration API Access, choose the DEFAULT department, and set the Role menu to System Owner. Owner is the department role, and 3CX answers 403 for it. Save. If the menu already says System Owner, open Advanced, Console Restrictions, and choose Allow access from everywhere.`;
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
