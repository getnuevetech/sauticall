import crypto from "crypto";
import { pbxRequest } from "./carriers";
import { flagOn, getDb, readDoc } from "./db";
import { chooseExtension, extensionRange, replacementExtension } from "./extension-numbers";
import { persistNewExtensionRanges, planExtensionRanges, readExtensionPlan, shiftPendingExtensions } from "./extension-plan";
import { extensionAddedNoticeIsOn, extensionWelcomeText, webClientUrl, welcomeCustomerNote } from "./extension-welcome";
import { describeExtensionFailure, numberAlreadyUsed } from "./pbx-access";
import {
  acceptedDepartmentName,
  departmentCreateBody,
  departmentNameIssue,
  departmentNameTakenMessage,
  departmentRangeBody,
  departmentRejectedMessage,
  normalizeDepartmentName,
  userCreateBody,
} from "./pbx-user";
import { idFromPbx } from "./pbx-id";
import { extensionCapacity, normalizePlan } from "./plan-features";
import type { Plan } from "./types";

export { extensionCapacity, chooseExtension, extensionRange, readExtensionPlan };

export { appPassword } from "./app-password";

type Department = { user_id: number; name: string; xapi_id: number; number_from: string; number_to: string; open_time: string; close_time: string; last_message: string };

class PhoneSystemError extends Error {
  admin: string;
  constructor(customer: string, admin = customer) {
    super(customer);
    this.admin = admin;
  }
}
type ExtensionRow = { id: number; user_id: number; number: string; first_name: string; last_name: string; email: string; xapi_id: number; status: string; access_password: string; last_message: string };

async function findUserByNumber(number: string) {
  const found = await pbxRequest(`Users?$filter=${encodeURIComponent(`Number eq '${number}'`)}&$select=Id,Number,EmailAddress`);
  if (!found.ok) return { ok: false as const, user: null, message: found.detail || found.message };
  const match = readList(found.body).find((item) => String(item.Number ?? "") === number);
  if (!match) return { ok: true as const, user: null, message: "" };
  return { ok: true as const, user: { id: idFromPbx(match), email: String(match.EmailAddress || "") }, message: "" };
}

function extensionFailure(number: string, result: { status: number; code?: string; detail?: string; role?: string }, lookup: { ok: boolean; user: { email: string } | null; message: string }) {
  return describeExtensionFailure({
    number,
    status: result.status,
    code: result.code || "",
    detail: result.detail || "",
    role: result.role || "",
    existing: lookup.ok ? lookup.user : undefined,
    lookupFailed: lookup.ok ? "" : lookup.message,
  });
}

function liveNumber(body: unknown) {
  if (!body || typeof body !== "object" || !("Number" in body)) return "";
  return String((body as { Number?: unknown }).Number ?? "").trim();
}

function rememberLiveNumber(id: number, userId: number, current: string, live: string) {
  if (!/^\d+$/.test(live) || live === current) return current;
  const clash = getDb().prepare("SELECT id FROM pbx_extensions WHERE user_id = ? AND number = ? AND id != ?").get(userId, live, id);
  if (clash) return current;
  getDb().prepare("UPDATE pbx_extensions SET number = ? WHERE id = ?").run(live, id);
  return live;
}

async function keepExtensionWelcomeOff() {
  const current = await pbxRequest("NotificationSettings");
  if (current.ok && !extensionAddedNoticeIsOn(current.body)) return "";
  const updated = await pbxRequest("NotificationSettings", { method: "PATCH", body: { NotifyExtensionAdded: false } });
  if (updated.ok) return "";
  return `The phone system may still email new extensions (${updated.message}).`;
}

async function deliverWelcome(person: { xapiId: number; firstName: string; number: string; email: string }) {
  const sent = await pbxRequest(`Users(${person.xapiId})/Pbx.SendWelcomeEmail`, { method: "POST", body: {} });
  const phone = sent.ok ? "The phone system sent the welcome email." : `The phone system did not send the welcome email (${sent.message}).`;
  try {
    const { getConnection } = await import("./carriers");
    const { mailSettings } = await import("./tickets");
    const { sendMail } = await import("./smtp");
    const settings = mailSettings();
    const webClient = webClientUrl(String(getConnection("3cx").public.base_url || ""));
    const text = extensionWelcomeText({ firstName: person.firstName, number: person.number, email: person.email, webClient });
    if (!settings?.smtp_host || !settings.smtp_from) {
      return { note: welcomeCustomerNote(sent.ok), detail: `${phone} Outgoing email is not set up, so the SautiCall setup email was not sent.` };
    }
    const result = await sendMail({
      host: settings.smtp_host,
      port: Number(settings.smtp_port) || 587,
      user: settings.smtp_user,
      pass: settings.smtp_pass,
      secure: settings.smtp_secure === 1,
      from: settings.smtp_from,
      to: [person.email],
      subject: `Your SautiCall extension ${person.number}`,
      text,
      messageId: `sc-ext-${person.xapiId}-${crypto.randomBytes(6).toString("hex")}@sauticall`,
    });
    const setup = result.ok ? "SautiCall sent the setup email." : `The SautiCall setup email failed: ${result.message}`;
    return { note: welcomeCustomerNote(sent.ok || result.ok), detail: `${phone} ${setup}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The setup email could not be sent.";
    return { note: welcomeCustomerNote(sent.ok), detail: `${phone} ${message}` };
  }
}

function readList(body: unknown) {
  if (body && typeof body === "object" && "value" in body && Array.isArray((body as { value?: unknown }).value)) {
    return (body as { value: { Id?: number; EmailAddress?: string; Number?: string | number }[] }).value;
  }
  return [];
}

function nextPage(body: unknown) {
  if (!body || typeof body !== "object" || !("@odata.nextLink" in body)) return "";
  const link = String((body as { "@odata.nextLink"?: unknown })["@odata.nextLink"] || "");
  const marker = "/xapi/v1/";
  const index = link.indexOf(marker);
  if (index >= 0) return link.slice(index + marker.length);
  return link.replace(/^\//, "");
}

const PHONE_SYSTEM_PAGE = 100;

function capTop(path: string) {
  if (!/\$top=/i.test(path)) return path;
  return path.replace(/(\$top=)\d+/gi, `$1${PHONE_SYSTEM_PAGE}`);
}

async function collectNumbers(collection: string) {
  const numbers: string[] = [];
  let seen = 0;
  let previousPage = "";
  let path = `${collection}?$select=Number&$top=${PHONE_SYSTEM_PAGE}`;
  for (let page = 0; page < 50 && path; page += 1) {
    const result = await pbxRequest(capTop(path));
    if (!result.ok) return { ok: false as const, numbers, message: result.message };
    const batch = readList(result.body);
    const signature = batch.map((item) => String(item.Number ?? "").trim()).join(",");
    if (page > 0 && signature === previousPage) break;
    previousPage = signature;
    seen += batch.length;
    for (const item of batch) {
      const number = String(item.Number ?? "").trim();
      if (number) numbers.push(number);
    }
    const linked = nextPage(result.body);
    if (linked && linked !== path) {
      path = linked;
      continue;
    }
    if (batch.length < PHONE_SYSTEM_PAGE) break;
    const skipped = `${collection}?$select=Number&$top=${PHONE_SYSTEM_PAGE}&$skip=${seen}`;
    if (skipped === path) break;
    path = skipped;
  }
  return { ok: true as const, numbers, message: "" };
}

export async function alignStoredExtensions() {
  if (!flagOn("pbx.live_provision")) return;
  const database = getDb();
  const rows = database.prepare("SELECT id, user_id, number, xapi_id FROM pbx_extensions WHERE xapi_id != 0 AND status != 'removed'").all() as { id: number; user_id: number; number: string; xapi_id: number }[];
  if (!rows.length) return;
  const byId = new Map(rows.map((row) => [row.xapi_id, row]));
  let seen = 0;
  let previousPage = "";
  let path = `Users?$select=Id,Number&$top=${PHONE_SYSTEM_PAGE}`;
  try {
    for (let page = 0; page < 50 && path; page += 1) {
      const result = await pbxRequest(capTop(path));
      if (!result.ok) return;
      const batch = readList(result.body);
      const signature = batch.map((item) => `${item.Id ?? ""}:${item.Number ?? ""}`).join(",");
      if (page > 0 && signature === previousPage) break;
      previousPage = signature;
      seen += batch.length;
      for (const item of batch) {
        const local = byId.get(Number(item.Id) || 0);
        if (!local) continue;
        rememberLiveNumber(local.id, local.user_id, local.number, String(item.Number ?? "").trim());
      }
      const linked = nextPage(result.body);
      if (linked && linked !== path) {
        path = linked;
        continue;
      }
      if (batch.length < PHONE_SYSTEM_PAGE) break;
      const skipped = `Users?$select=Id,Number&$top=${PHONE_SYSTEM_PAGE}&$skip=${seen}`;
      if (skipped === path) break;
      path = skipped;
    }
  } catch {
    return;
  }
}

export async function listPhoneSystemNumbers() {
  const users = await collectNumbers("Users");
  if (!users.ok) return { ok: false, numbers: [] as string[], message: users.message || "The phone system could not be read, so a free extension was not assigned." };
  const numbers = [...users.numbers];
  const groups = await collectNumbers("RingGroups");
  if (groups.ok) numbers.push(...groups.numbers);
  const queues = await collectNumbers("Queues");
  if (queues.ok) numbers.push(...queues.numbers);
  return { ok: true, numbers, message: "" };
}

const NUMBER_COLLECTIONS = ["Users", "RingGroups", "Queues", "Receptionists", "Fax", "Parkings"];

export async function extensionNumberUsed(number: string) {
  const safe = number.replace(/'/g, "''");
  let denied = "";
  for (const collection of NUMBER_COLLECTIONS) {
    const result = await pbxRequest(`${collection}?$filter=${encodeURIComponent(`Number eq '${safe}'`)}&$select=Number&$top=1`);
    if (result.status === 0) return { ok: false as const, used: false, message: result.message };
    if (result.status === 400 || result.status === 404 || result.status === 501) continue;
    if (!result.ok) {
      if (collection === "Users") denied = result.message;
      continue;
    }
    const hit = readList(result.body).some((item) => String(item.Number ?? "").trim() === number);
    if (hit) return { ok: true as const, used: true, message: "" };
  }
  if (denied) return { ok: false as const, used: false, message: denied };
  return { ok: true as const, used: false, message: "" };
}

export async function allocateExtension(userId: number, used: string[], plan = readExtensionPlan(), ranges?: { id: number; from: number; to: number }[]) {
  const reserved = ranges ? { plan, ranges } : planExtensionRanges();
  const taken = [...used];
  const live = flagOn("pbx.live_provision");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = chooseExtension(userId, taken, [], reserved.plan, reserved.ranges);
    if (!candidate) return { ok: false as const, number: "", message: "No free extension is left from the starting number." };
    if (!live) return { ok: true as const, number: candidate, message: "" };
    const check = await extensionNumberUsed(candidate);
    if (!check.ok) return { ok: false as const, number: "", message: check.message };
    if (!check.used) return { ok: true as const, number: candidate, message: "" };
    taken.push(candidate);
  }
  return { ok: false as const, number: "", message: "No free extension is left from the starting number." };
}

export function paidPlan(userId: number) {
  const row = getDb().prepare("SELECT plan_name FROM payment_attempts WHERE user_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1").get(userId) as { plan_name: string } | undefined;
  if (!row?.plan_name) return null;
  const plans = readDoc<Plan[]>("plans");
  const plan = plans.find((item) => item.name === row.plan_name && !item.custom);
  return plan ? normalizePlan(plan) : null;
}

function readGroups(body: unknown) {
  if (!(body && typeof body === "object" && Array.isArray((body as { value?: unknown }).value))) return [];
  return ((body as { value: { Id?: number; Name?: unknown; IsDefault?: unknown }[] }).value).map((item) => ({
    id: Number(item.Id) || 0,
    name: String(item.Name || ""),
    isDefault: item.IsDefault === true || /^default$/i.test(String(item.Name || "").trim()),
  }));
}

function departmentFailure(name: string, result: { status?: number; message?: string; code?: string; detail?: string }) {
  const raw = `${result.detail || ""} ${result.message || ""} ${result.code || ""}`;
  const admin = result.message || departmentRejectedMessage(name);
  if (result.status === 403 || /console restrictions|system owner|access denied/i.test(raw)) {
    return { customer: "The phone system refused this department. The team has the details. People are added to the company department.", admin };
  }
  if (/duplicate|already exists|WARNINGS\.XAPI\.DUPLICATE/i.test(raw)) return { customer: departmentNameTakenMessage(name), admin };
  if (result.status === 400 && /name/i.test(raw)) return { customer: departmentRejectedMessage(name), admin };
  if (result.status === 400) return { customer: "The phone system rejected the department. The team has the details. People are added to the company department.", admin };
  return { customer: "The phone system did not save the company department. The team has the details. People are added to the company department.", admin };
}

function noteDepartment(userId: number, message: string) {
  const database = getDb();
  const existing = database.prepare("SELECT user_id FROM pbx_departments WHERE user_id = ?").get(userId);
  if (!existing) return;
  database.prepare("UPDATE pbx_departments SET last_message = ? WHERE user_id = ?").run(message.slice(0, 1200), userId);
}

function saveDepartmentRecord(userId: number, name: string, xapiId: number, from: number, to: number, message: string) {
  getDb().prepare(
    `INSERT INTO pbx_departments (user_id, name, xapi_id, number_from, number_to, open_time, close_time, last_message)
     VALUES (?, ?, ?, ?, ?, '09:00', '17:00', ?)
     ON CONFLICT(user_id) DO UPDATE SET
       name = excluded.name,
       xapi_id = CASE WHEN excluded.xapi_id != 0 THEN excluded.xapi_id ELSE pbx_departments.xapi_id END,
       number_from = CASE WHEN excluded.number_from != '' THEN excluded.number_from ELSE pbx_departments.number_from END,
       number_to = CASE WHEN excluded.number_to != '' THEN excluded.number_to ELSE pbx_departments.number_to END,
       last_message = excluded.last_message`,
  ).run(userId, name, xapiId, String(from), String(to), message.slice(0, 1200));
}

function plannedDepartmentRange(userId: number) {
  const reserved = planExtensionRanges();
  persistNewExtensionRanges(reserved.ranges);
  const match = reserved.ranges.find((range) => range.id === userId);
  const range = match || extensionRange(userId, reserved.plan);
  return { from: range.from, to: range.to };
}

async function findGroupByName(name: string) {
  const found = await pbxRequest(`Groups?$filter=${encodeURIComponent(`Name eq '${name}'`)}&$select=Id,Name,IsDefault`);
  if (!found.ok) return { ok: false as const, group: null, message: found.message || "" };
  const group = readGroups(found.body).find((item) => item.name.toLowerCase() === name.toLowerCase()) || null;
  return { ok: true as const, group, message: "" };
}

async function readGroup(id: number) {
  const found = await pbxRequest(`Groups(${id})?$select=Id,Name,IsDefault`);
  if (!found.ok || !found.body || typeof found.body !== "object") return { ok: false as const, name: "", isDefault: false, message: found.message || "" };
  const body = found.body as { Name?: unknown; IsDefault?: unknown };
  const name = String(body.Name || "");
  return { ok: true as const, name, isDefault: body.IsDefault === true || /^default$/i.test(name.trim()), message: "" };
}

async function placePeople(userId: number, groupId: number) {
  const people = getDb().prepare("SELECT xapi_id, number FROM pbx_extensions WHERE user_id = ? AND xapi_id != 0 AND status != 'removed'").all(userId) as { xapi_id: number; number: string }[];
  for (const person of people) {
    const assigned = await pbxRequest(`Users(${person.xapi_id})`, {
      method: "PATCH",
      body: { Id: person.xapi_id, Groups: [{ GroupId: groupId, Rights: { RoleName: "users" } }] },
    });
    if (!assigned.ok) {
      return {
        ok: false as const,
        customer: `The company department was saved. Extension ${person.number} still needs to be moved onto it. Save the company name again.`,
        admin: assigned.message || "",
      };
    }
  }
  return { ok: true as const, customer: "", admin: "" };
}

async function createNamedDepartment(userId: number, name: string, from: number, to: number) {
  const found = await findGroupByName(name);
  if (!found.ok) {
    const failure = departmentFailure(name, { message: found.message });
    noteDepartment(userId, failure.admin);
    throw new PhoneSystemError(failure.customer, failure.admin);
  }
  if (found.group?.isDefault) {
    const customer = "DEFAULT is reserved. Enter the company name so people are added to that department.";
    noteDepartment(userId, `3CX already has a department named ${found.group.name}, and it is the default department.`);
    throw new PhoneSystemError(customer, `3CX already has a department named ${found.group.name}, and it is the default department.`);
  }
  if (found.group?.id) {
    const failure = departmentFailure(name, { status: 400, code: "WARNINGS.XAPI.DUPLICATE", message: `3CX returned 400: WARNINGS.XAPI.DUPLICATE. Name ${name} already exists.` });
    noteDepartment(userId, failure.admin);
    throw new PhoneSystemError(failure.customer, failure.admin);
  }
  const created = await pbxRequest("Groups", {
    method: "POST",
    body: departmentCreateBody(name, from, to),
  });
  const id = idFromPbx(created.body, created.location);
  const createdBody = created.body && typeof created.body === "object" ? created.body as { Name?: unknown; IsDefault?: unknown } : {};
  const createdName = String(createdBody.Name || name);
  const createdDefault = createdBody.IsDefault === true || /^default$/i.test(createdName.trim());
  if (!created.ok || !id || createdDefault) {
    const failure = createdDefault
      ? { customer: "DEFAULT is reserved. Enter the company name so people are added to that department.", admin: created.message || "3CX created the default department." }
      : departmentFailure(name, created);
    noteDepartment(userId, failure.admin);
    throw new PhoneSystemError(failure.customer, failure.admin);
  }
  saveDepartmentRecord(userId, name, id, from, to, "Company department saved.");
  return getDb().prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department;
}

async function ensureDepartment(userId: number) {
  const database = getDb();
  const range = plannedDepartmentRange(userId);
  const existing = database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  const name = acceptedDepartmentName(existing?.name || "");
  if (!name) {
    const customer = departmentNameIssue(existing?.name || "");
    throw new PhoneSystemError(customer);
  }
  if (existing?.xapi_id) {
    const currentFrom = Number(existing.number_from);
    const currentTo = Number(existing.number_to);
    const nextFrom = Number.isInteger(currentFrom) && currentFrom > 0 ? Math.min(currentFrom, range.from) : range.from;
    const nextTo = Number.isInteger(currentTo) && currentTo >= nextFrom ? Math.max(currentTo, range.to) : range.to;
    if (String(nextFrom) !== existing.number_from || String(nextTo) !== existing.number_to) {
      const widened = await pbxRequest(`Groups(${existing.xapi_id})`, {
        method: "PATCH",
        body: departmentRangeBody(nextFrom, nextTo),
      });
      if (widened.ok) database.prepare("UPDATE pbx_departments SET number_from = ?, number_to = ? WHERE user_id = ?").run(String(nextFrom), String(nextTo), userId);
    }
    const group = await readGroup(existing.xapi_id);
    if (group.ok && group.isDefault) {
      const customer = "DEFAULT is reserved. Enter the company name so people are added to that department.";
      const admin = `Department ${existing.xapi_id} on 3CX is the default department.`;
      noteDepartment(userId, admin);
      throw new PhoneSystemError(customer, admin);
    }
    if (group.ok && group.name && normalizeDepartmentName(group.name) !== name) {
      const renamed = await pbxRequest(`Groups(${existing.xapi_id})`, {
        method: "PATCH",
        body: { Id: existing.xapi_id, Name: name },
      });
      if (!renamed.ok) {
        const failure = departmentFailure(name, renamed);
        noteDepartment(userId, failure.admin);
        throw new PhoneSystemError(failure.customer, failure.admin);
      }
    }
    if (existing.name !== name) database.prepare("UPDATE pbx_departments SET name = ? WHERE user_id = ?").run(name, userId);
    const department = database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department;
    if (!department.xapi_id) throw new PhoneSystemError("Enter the company name. That name becomes the department, and people are added to it.");
    return department;
  }
  return createNamedDepartment(userId, name, range.from, range.to);
}

export async function applyDepartmentName(userId: number, raw: string) {
  const name = normalizeDepartmentName(raw);
  const issue = departmentNameIssue(name);
  if (issue) return { ok: false as const, message: issue, detail: issue };
  const database = getDb();
  const clash = database.prepare("SELECT user_id FROM pbx_departments WHERE user_id != ? AND lower(trim(name)) = lower(?)").get(userId, name) as { user_id: number } | undefined;
  if (clash) {
    const message = departmentNameTakenMessage(name);
    return { ok: false as const, message, detail: message };
  }
  const range = plannedDepartmentRange(userId);
  const existing = database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  if (!flagOn("pbx.live_provision")) {
    saveDepartmentRecord(userId, name, existing?.xapi_id || 0, range.from, range.to, "Company name saved. It becomes the department when people are added.");
    return { ok: true as const, message: "Company name saved. It becomes the department when people are added.", detail: "" };
  }
  try {
    let department: Department;
    if (existing?.xapi_id) {
      const group = await readGroup(existing.xapi_id);
      if (!group.ok) {
        const failure = departmentFailure(name, { message: group.message });
        noteDepartment(userId, failure.admin);
        return { ok: false as const, message: failure.customer, detail: failure.admin };
      }
      if (group.isDefault) {
        const customer = "DEFAULT is reserved. Enter the company name so people are added to that department.";
        const admin = `Department ${existing.xapi_id} on 3CX is the default department.`;
        noteDepartment(userId, admin);
        return { ok: false as const, message: customer, detail: admin };
      }
      if (normalizeDepartmentName(group.name || existing.name) !== name) {
        const renamed = await pbxRequest(`Groups(${existing.xapi_id})`, {
          method: "PATCH",
          body: { Id: existing.xapi_id, Name: name },
        });
        if (!renamed.ok) {
          const failure = departmentFailure(name, renamed);
          noteDepartment(userId, failure.admin);
          return { ok: false as const, message: failure.customer, detail: failure.admin };
        }
      }
      saveDepartmentRecord(userId, name, existing.xapi_id, range.from, range.to, "Company department saved.");
      department = database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department;
    } else {
      department = await createNamedDepartment(userId, name, range.from, range.to);
    }
    const placed = await placePeople(userId, department.xapi_id);
    if (!placed.ok) {
      noteDepartment(userId, placed.admin);
      return { ok: false as const, message: placed.customer, detail: placed.admin };
    }
    return { ok: true as const, message: "Company name saved. People are added to this department.", detail: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The phone system did not save this department.";
    const detail = error instanceof PhoneSystemError ? error.admin : message;
    noteDepartment(userId, detail);
    return { ok: false as const, message, detail };
  }
}

function route(number: string, to: "Extension" | "VoiceMail" | "RingGroup" | "Queue") {
  return { IsPromptEnabled: false, Route: { External: "", Number: number, To: to } };
}

function daytimeDestination(userId: number) {
  const group = getDb()
    .prepare("SELECT kind, number FROM call_groups WHERE user_id = ? AND answers = 1 AND status IN ('created', 'manual') ORDER BY id DESC LIMIT 1")
    .get(userId) as { kind: string; number: string } | undefined;
  if (group?.number) return { number: group.number, to: group.kind === "queue" ? "Queue" as const : "RingGroup" as const };
  const first = getDb().prepare("SELECT number FROM pbx_extensions WHERE user_id = ? AND xapi_id != 0 AND status != 'removed' ORDER BY id LIMIT 1").get(userId) as { number: string } | undefined;
  if (!first) return null;
  return { number: first.number, to: "Extension" as const };
}

function daytimeLabel(to: string, number: string) {
  if (to === "Queue") return `queue ${number}`;
  if (to === "RingGroup") return `ring group ${number}`;
  return number;
}

async function routeDepartment(department: Department) {
  const destination = daytimeDestination(department.user_id);
  if (!department.xapi_id || !destination) return { ok: true, message: "Hours saved." };
  const result = await pbxRequest(`Groups(${department.xapi_id})`, {
    method: "PATCH",
    body: {
      Id: department.xapi_id,
      OfficeRoute: route(destination.number, destination.to),
      BreakRoute: route(destination.number, "VoiceMail"),
      OutOfOfficeRoute: route(destination.number, "VoiceMail"),
      HolidaysRoute: route(destination.number, "VoiceMail"),
    },
  });
  const label = daytimeLabel(destination.to, destination.number);
  getDb().prepare("UPDATE pbx_departments SET last_message = ? WHERE user_id = ?").run(result.ok ? `Calls go to ${label} during the day and voicemail after hours.` : result.message, department.user_id);
  return result;
}

function savedNumbers() {
  const database = getDb();
  return [
    ...(database.prepare("SELECT number FROM pbx_extensions WHERE status != 'removed'").all() as { number: string }[]),
    ...(database.prepare("SELECT number FROM call_groups").all() as { number: string }[]),
  ].map((item) => item.number);
}

async function moveExtension(row: ExtensionRow, plan: ReturnType<typeof readExtensionPlan>, rejected: string[], known: string[]) {
  const taken = [...savedNumbers(), ...rejected, ...known, row.number];
  const reserved = planExtensionRanges();
  const next = replacementExtension(row.number, plan.start, taken, row.user_id, reserved.ranges, reserved.plan);
  if (!next || next === row.number) return null;
  getDb().prepare("UPDATE pbx_extensions SET number = ? WHERE id = ? AND xapi_id = 0").run(next, row.id);
  return { ...row, number: next };
}

export async function provisionExtension(id: number) {
  const database = getDb();
  let row = database.prepare("SELECT * FROM pbx_extensions WHERE id = ?").get(id) as ExtensionRow | undefined;
  if (!row) return { ok: false, message: "That person was not found." };
  if (row.xapi_id) return { ok: true, message: "Already on the phone system." };
  if (!flagOn("pbx.live_provision")) {
    database.prepare("UPDATE pbx_extensions SET status = 'waiting', last_message = ? WHERE id = ?").run("Creating people on the phone system is turned off.", id);
    return { ok: false, message: "Creating people on the phone system is turned off." };
  }
  try {
    const plan = readExtensionPlan();
    if (!(Number(row.number) >= plan.start)) {
      shiftPendingExtensions(plan);
      const refreshed = database.prepare("SELECT * FROM pbx_extensions WHERE id = ?").get(id) as ExtensionRow | undefined;
      if (!refreshed) return { ok: false, message: "That person was not found." };
      row = refreshed;
    }
    if (!(Number(row.number) >= plan.start)) return { ok: false, message: "No free extension is left from the starting number." };
    const department = await ensureDepartment(row.user_id);
    if (!department.xapi_id) throw new PhoneSystemError("Enter the company name. That name becomes the department, and people are added to it.");
    const welcomeBlocked = await keepExtensionWelcomeOff();
    const listed = await listPhoneSystemNumbers();
    const known = listed.ok ? listed.numbers : [];
    const rejected: string[] = [];
    let movedFrom = "";
    let xapiId = 0;
    let linkedExisting = "";
    let createdHere = false;
    let posts = 0;
    for (let attempt = 0; attempt < 30 && posts < 8; attempt += 1) {
      const lookup = await findUserByNumber(row.number);
      const sameEmail = Boolean(lookup.user && lookup.user.email.toLowerCase() === row.email.toLowerCase() && lookup.user.id);
      if (sameEmail && lookup.user) {
        xapiId = lookup.user.id;
        linkedExisting = `Extension ${row.number} already exists on 3CX for ${lookup.user.email}, so that user was linked.`;
        break;
      }
      const occupied = await extensionNumberUsed(row.number);
      if ((occupied.ok && occupied.used) || lookup.user) {
        const moved = await moveExtension(row, plan, rejected, known);
        if (!moved) throw new Error(lookup.user ? extensionFailure(row.number, { status: 409, code: "ALREADY_IN_USE", detail: "This extension number is already used on 3CX." }, lookup) : "No free extension is left from the starting number.");
        rejected.push(row.number);
        movedFrom = movedFrom || row.number;
        row = moved;
        continue;
      }
      posts += 1;
      const created = await pbxRequest("Users", {
        method: "POST",
        body: userCreateBody({
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          number: row.number,
          password: row.access_password,
          groupId: department.xapi_id || undefined,
        }),
      });
      xapiId = idFromPbx(created.body, created.location);
      if (created.ok) {
        createdHere = true;
        if (!xapiId) {
          const found = await findUserByNumber(row.number);
          if (found.user?.id && found.user.email.toLowerCase() === row.email.toLowerCase()) xapiId = found.user.id;
        }
        if (!xapiId) throw new Error(created.detail || created.message || "3CX did not return an extension id.");
        linkedExisting = movedFrom ? `Extension ${movedFrom} already exists on 3CX, so this person was created as ${row.number}.` : "";
        break;
      }
      const again = await findUserByNumber(row.number);
      const againSame = Boolean(again.user && again.user.email.toLowerCase() === row.email.toLowerCase() && again.user.id);
      if (againSame && again.user) {
        xapiId = again.user.id;
        linkedExisting = `Extension ${row.number} already exists on 3CX for ${again.user.email}, so that user was linked.`;
        break;
      }
      const collision = Boolean(again.user) || numberAlreadyUsed(created.code || "", `${created.detail || ""} ${created.message || ""}`, created.status);
      if (!collision) throw new Error(extensionFailure(row.number, created, again.ok ? again : lookup));
      const moved = await moveExtension(row, plan, rejected, known);
      if (!moved) throw new Error(extensionFailure(row.number, created, again));
      rejected.push(row.number);
      movedFrom = movedFrom || row.number;
      row = moved;
      xapiId = 0;
    }
    if (!xapiId) throw new Error(movedFrom ? `Extension ${movedFrom} already exists on 3CX, and no free extension is left from the starting number.` : "3CX did not return an extension id.");
    const assigned = await pbxRequest(`Users(${xapiId})`, {
      method: "PATCH",
      body: {
        Id: xapiId,
        Groups: [{ GroupId: department.xapi_id, Rights: { RoleName: "users" } }],
      },
    });
    if (!assigned.ok) {
      let admin = assigned.message || "The phone system did not place this person on the company department.";
      if (createdHere) {
        const deleted = await pbxRequest(`Users(${xapiId})`, { method: "DELETE" });
        if (!deleted.ok && deleted.status !== 404) admin = `${admin} The new extension stayed on the phone system: ${deleted.message}`;
      }
      throw new PhoneSystemError("The phone system did not place this person on the company department.", admin);
    }
    const confirmed = await pbxRequest(`Users(${xapiId})?$select=Id,Number`);
    if (confirmed.ok) row.number = rememberLiveNumber(id, row.user_id, row.number, liveNumber(confirmed.body));
    const welcome = await deliverWelcome({ xapiId, firstName: row.first_name, number: row.number, email: row.email });
    if (/setup email failed|Outgoing email is not set up/.test(welcome.detail)) {
      const { recordFailure } = await import("./failure-log");
      recordFailure({ area: "email", userId: row.user_id, subject: row.email, detail: welcome.detail });
    }
    const message = [linkedExisting || `Extension ${row.number} is on the phone system.`, welcomeBlocked, welcome.detail].filter(Boolean).join(" ");
    database.prepare("UPDATE pbx_extensions SET number = ?, xapi_id = ?, status = 'created', last_message = ?, welcome_note = ? WHERE id = ?").run(row.number, xapiId, message.slice(0, 1200), welcome.note, id);
    await routeDepartment(department);
    return { ok: true, message: "Created on the phone system." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The phone system did not create this person.";
    const detail = error instanceof PhoneSystemError ? error.admin : message;
    database.prepare("UPDATE pbx_extensions SET status = 'failed', last_message = ? WHERE id = ?").run(detail.slice(0, 1200), id);
    const { recordFailure } = await import("./failure-log");
    recordFailure({ area: "extension", userId: row.user_id, subject: row.number, detail });
    return { ok: false, message, detail };
  }
}

export async function removeExtension(id: number) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM pbx_extensions WHERE id = ?").get(id) as ExtensionRow | undefined;
  if (!row) return { ok: false, message: "That person was not found." };
  if (row.status === "removed") return { ok: true, message: "Already removed. The record is kept." };
  if (row.xapi_id && !flagOn("pbx.live_provision")) {
    return { ok: false, message: "Creating people on the phone system is turned off, so this person is still on 3CX." };
  }
  if (row.xapi_id) {
    const removed = await pbxRequest(`Users(${row.xapi_id})`, { method: "DELETE" });
    if (!removed.ok && removed.status !== 404) {
      const { recordFailure } = await import("./failure-log");
      recordFailure({ area: "extension", userId: row.user_id, subject: row.number, detail: removed.message });
      return { ok: false, message: removed.message };
    }
  }
  const groups = database.prepare(
    `SELECT g.id, g.kind, g.xapi_id FROM call_groups g
     JOIN call_group_members m ON m.group_id = g.id WHERE m.extension_id = ?`,
  ).all(id) as { id: number; kind: string; xapi_id: number }[];
  database.prepare("DELETE FROM call_group_members WHERE extension_id = ?").run(id);
  const removedAt = new Date().toISOString();
  database.prepare(
    `UPDATE pbx_extensions
     SET former_number = ?, number = ?, status = 'removed', removed_at = ?, xapi_id = 0, access_password = '', last_message = ?
     WHERE id = ?`,
  ).run(row.number, `retired-${id}`, removedAt, `Removed from the phone system. Extension ${row.number} stays in the record for ${row.first_name} ${row.last_name}.`, id);
  for (const group of groups) {
    const left = database.prepare("SELECT COUNT(*) AS n FROM call_group_members WHERE group_id = ?").get(group.id) as { n: number };
    if (!group.xapi_id || !flagOn("pbx.live_provision")) {
      if (!left.n) database.prepare("UPDATE call_groups SET answers = 0, last_message = ? WHERE id = ?").run("This group has no people.", group.id);
      continue;
    }
    if (!left.n) {
      const path = group.kind === "queue" ? "Queues" : "RingGroups";
      const deleted = await pbxRequest(`${path}(${group.xapi_id})`, { method: "DELETE" });
      database.prepare("UPDATE call_groups SET xapi_id = 0, status = 'waiting', answers = 0, last_message = ? WHERE id = ?").run(
        deleted.ok || deleted.status === 404 ? "This group has no people, so it was removed from the phone system. The name stays here." : deleted.message.slice(0, 400),
        group.id,
      );
      continue;
    }
    const { provisionCallGroup } = await import("./call-groups");
    const result = await provisionCallGroup(group.id);
    if (!result.ok) database.prepare("UPDATE call_groups SET last_message = ? WHERE id = ?").run(result.message.slice(0, 400), group.id);
  }
  await updateRouting(row.user_id);
  return { ok: true, message: "Removed. The name, email, and extension stay in the record." };
}

export async function updateExtensionProfile(id: number, userId: number, input: { first: string; last: string; email: string }) {
  const row = getDb().prepare("SELECT * FROM pbx_extensions WHERE id = ? AND user_id = ?").get(id, userId) as ExtensionRow | undefined;
  if (!row) return { ok: false, message: "That person was not found." };
  if (row.status === "removed") return { ok: false, message: "This person was removed. The record stays as it is." };
  const first = input.first.trim().replace(/\s+/g, " ").slice(0, 40);
  const last = input.last.trim().replace(/\s+/g, " ").slice(0, 40);
  const email = input.email.trim().toLowerCase().slice(0, 120);
  if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a first name, last name, and email." };
  if (row.xapi_id) {
    if (!flagOn("pbx.live_provision")) return { ok: false, message: "The phone system is not accepting changes right now." };
    const patched = await pbxRequest(`Users(${row.xapi_id})`, {
      method: "PATCH",
      body: { Id: row.xapi_id, FirstName: first, LastName: last, EmailAddress: email },
    });
    if (!patched.ok) {
      const detail = patched.message || "The name could not be saved.";
      const { recordFailure } = await import("./failure-log");
      recordFailure({ area: "extension", userId: row.user_id, subject: row.number, detail });
      return { ok: false, message: detail };
    }
  }
  getDb().prepare("UPDATE pbx_extensions SET first_name = ?, last_name = ?, email = ? WHERE id = ?").run(first, last, email, id);
  return { ok: true, message: "Saved." };
}

export async function updateRouting(userId: number) {
  const department = getDb().prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  const destination = daytimeDestination(userId);
  if (!department?.xapi_id || !destination) return { ok: true, message: "Hours saved." };
  if (!flagOn("pbx.live_provision")) return { ok: false, message: "Creating people on the phone system is turned off." };
  const result = await routeDepartment(department);
  return { ok: result.ok, message: result.ok ? "Call routing updated." : result.message };
}
