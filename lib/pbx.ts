import crypto from "crypto";
import { pbxRequest } from "./carriers";
import { flagOn, getDb, readDoc } from "./db";
import { chooseExtension, extensionRange, replacementExtension } from "./extension-numbers";
import { persistNewExtensionRanges, planExtensionRanges, readExtensionPlan, shiftPendingExtensions } from "./extension-plan";
import { describeExtensionFailure, numberAlreadyUsed } from "./pbx-access";
import { idFromPbx } from "./pbx-id";
import { extensionCapacity, normalizePlan } from "./plan-features";
import type { Plan } from "./types";

export { extensionCapacity, chooseExtension, extensionRange, readExtensionPlan };

export function appPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

type Department = { user_id: number; name: string; xapi_id: number; number_from: string; number_to: string; open_time: string; close_time: string; last_message: string };
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

async function ensureDepartment(userId: number) {
  const database = getDb();
  const existing = database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  const reserved = planExtensionRanges();
  persistNewExtensionRanges(reserved.ranges);
  const match = reserved.ranges.find((range) => range.id === userId);
  const fallback = extensionRange(userId, reserved.plan);
  const range = match || fallback;
  if (existing?.xapi_id) {
    const currentFrom = Number(existing.number_from);
    const currentTo = Number(existing.number_to);
    const nextFrom = Number.isInteger(currentFrom) && currentFrom > 0 ? Math.min(currentFrom, range.from) : range.from;
    const nextTo = Number.isInteger(currentTo) && currentTo >= nextFrom ? Math.max(currentTo, range.to) : range.to;
    if (String(nextFrom) !== existing.number_from || String(nextTo) !== existing.number_to) {
      const widened = await pbxRequest(`Groups(${existing.xapi_id})`, {
        method: "PATCH",
        body: { Id: existing.xapi_id, UserNumberFrom: String(nextFrom), UserNumberTo: String(nextTo) },
      });
      if (widened.ok) database.prepare("UPDATE pbx_departments SET number_from = ?, number_to = ? WHERE user_id = ?").run(String(nextFrom), String(nextTo), userId);
    }
    return database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department;
  }
  const name = `SautiCall ${userId}`;
  const found = await pbxRequest(`Groups?$filter=${encodeURIComponent(`Name eq '${name}'`)}&$select=Id,Name`);
  const listed = idFromPbx(readList(found.body)[0], found.location);
  if (found.ok && listed) {
    database.prepare(
      `INSERT INTO pbx_departments (user_id, name, xapi_id, number_from, number_to, open_time, close_time, last_message)
       VALUES (?, ?, ?, ?, ?, '09:00', '17:00', '')
       ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, xapi_id = excluded.xapi_id, number_from = excluded.number_from, number_to = excluded.number_to`,
    ).run(userId, name, listed, String(range.from), String(range.to));
    return database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department;
  }
  const created = await pbxRequest("Groups", {
    method: "POST",
    body: {
      AllowCallService: true,
      Language: "EN",
      Name: name,
      UserNumberFrom: String(range.from),
      UserNumberTo: String(range.to),
    },
  });
  const id = idFromPbx(created.body, created.location);
  if (!created.ok || !id) throw new Error(created.message);
  database.prepare(
    `INSERT INTO pbx_departments (user_id, name, xapi_id, number_from, number_to, open_time, close_time, last_message)
     VALUES (?, ?, ?, ?, ?, '09:00', '17:00', '')
     ON CONFLICT(user_id) DO UPDATE SET xapi_id = excluded.xapi_id, name = excluded.name`,
  ).run(userId, name, id, String(range.from), String(range.to));
  return database.prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department;
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
    const listed = await listPhoneSystemNumbers();
    const known = listed.ok ? listed.numbers : [];
    const rejected: string[] = [];
    let movedFrom = "";
    let xapiId = 0;
    let linkedExisting = "";
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
        body: {
          Id: 0,
          FirstName: row.first_name,
          LastName: row.last_name,
          EmailAddress: row.email,
          Number: row.number,
          Language: "EN",
          SendEmailMissedCalls: false,
          VMEmailOptions: "Notification",
          Require2FA: false,
          AccessPassword: row.access_password,
        },
      });
      xapiId = idFromPbx(created.body, created.location);
      if (created.ok) {
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
        Groups: [{ "@odata.type": "#Pbx.UserGroup", GroupId: department.xapi_id, Rights: { RoleName: "users" } }],
      },
    });
    const message = assigned.ok ? linkedExisting || "Created on the phone system." : `${linkedExisting ? `${linkedExisting} ` : ""}Created on the phone system. Department assignment needs attention: ${assigned.message}`;
    database.prepare("UPDATE pbx_extensions SET xapi_id = ?, status = 'created', last_message = ? WHERE id = ?").run(xapiId, message.slice(0, 1200), id);
    await routeDepartment(department);
    return { ok: true, message: "Created on the phone system." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The phone system did not create this person.";
    database.prepare("UPDATE pbx_extensions SET status = 'failed', last_message = ? WHERE id = ?").run(message.slice(0, 1200), id);
    return { ok: false, message };
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
    if (!removed.ok && removed.status !== 404) return { ok: false, message: removed.message };
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

export async function updateRouting(userId: number) {
  const department = getDb().prepare("SELECT * FROM pbx_departments WHERE user_id = ?").get(userId) as Department | undefined;
  const destination = daytimeDestination(userId);
  if (!department?.xapi_id || !destination) return { ok: true, message: "Hours saved." };
  if (!flagOn("pbx.live_provision")) return { ok: false, message: "Creating people on the phone system is turned off." };
  const result = await routeDepartment(department);
  return { ok: result.ok, message: result.ok ? "Call routing updated." : result.message };
}
