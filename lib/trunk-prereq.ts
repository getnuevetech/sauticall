import { verificationStatus } from "./account-verify";
import { appPassword } from "./app-password";
import { assignExtensionAi } from "./ai-account-store";
import { createCallGroup, groupMembers, provisionCallGroup, setDaytimeGroup, type CallGroup } from "./call-groups";
import { flagOn, getDb, readDoc } from "./db";
import { recordFailure } from "./failure-log";
import { finishAfterResponse } from "./later";
import { extensionCapacity, normalizePlan, planAllows } from "./plan-features";
import { accountDepartmentName, departmentNameIssue, accountDisplayName } from "./pbx-user";
import { allocateExtension, applyDepartmentName, provisionExtension, updateRouting } from "./pbx";
import { defaultTrunkDestination, extensionReady, receptionistAddress, signupPersonName } from "./trunk-route";
import type { Plan } from "./types";

export type TrunkDefaults = {
  ok: true;
  departmentId: number;
  departmentName: string;
  from: string;
  to: string;
  extensionNumber: string;
  target: { to: "Extension" | "RingGroup"; number: string; label: string; kind: "ai" | "ring" };
} | {
  ok: false;
  message: string;
};

function subscriptionPlan(userId: number) {
  const row = getDb().prepare(
    "SELECT plan_name FROM payment_attempts WHERE user_id = ? AND status = 'paid' AND plan_name != '' AND COALESCE(product_kind, '') != 'bundle' ORDER BY id DESC LIMIT 1",
  ).get(userId) as { plan_name: string } | undefined;
  if (!row?.plan_name) return null;
  const plan = readDoc<Plan[]>("plans").find((item) => item.name === row.plan_name);
  return plan ? normalizePlan(plan) : null;
}

export function accountIncludesReceptionist(userId: number) {
  return planAllows(subscriptionPlan(userId), "ai");
}

export function savedDefaultRoute(userId: number) {
  const ai = accountIncludesReceptionist(userId);
  const account = getDb().prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
  const accountEmail = (account?.email || "").toLowerCase();
  const person = getDb().prepare(
    "SELECT number, xapi_id FROM pbx_extensions WHERE user_id = ? AND status != 'removed' AND ai_role != 'receptionist' ORDER BY CASE WHEN lower(email) = ? THEN 0 ELSE 1 END, id LIMIT 1",
  ).get(userId, accountEmail) as { number: string; xapi_id: number } | undefined;
  const receptionist = getDb().prepare(
    "SELECT number, xapi_id, email FROM pbx_extensions WHERE user_id = ? AND status != 'removed' AND ai_role = 'receptionist' ORDER BY id LIMIT 1",
  ).get(userId) as { number: string; xapi_id: number; email: string } | undefined;
  const dedicated = receptionist && receptionist.email.toLowerCase() !== accountEmail ? receptionist : undefined;
  const ring = getDb().prepare(
    "SELECT name, number, xapi_id FROM call_groups WHERE user_id = ? AND kind = 'ring' AND xapi_id != 0 ORDER BY CASE WHEN name = 'Main' THEN 0 ELSE 1 END, id LIMIT 1",
  ).get(userId) as { name: string; number: string; xapi_id: number } | undefined;
  const chosen = defaultTrunkDestination({
    ai,
    aiExtension: dedicated?.number || "",
    ringName: ring?.name || "",
    ringNumber: ring?.number || "",
  });
  if (ai) {
    return {
      ai: true,
      extensionNumber: dedicated?.number || "",
      extensionOnPbx: Boolean(dedicated?.xapi_id),
      label: chosen?.label || "",
      onPbx: Boolean(dedicated?.xapi_id && chosen),
    };
  }
  return {
    ai: false,
    extensionNumber: person?.number || "",
    extensionOnPbx: Boolean(person?.xapi_id),
    label: chosen?.label || "",
    onPbx: Boolean(ring?.xapi_id && chosen),
  };
}

function defaultsSettled(userId: number) {
  const department = getDb().prepare("SELECT xapi_id, number_from, number_to FROM pbx_departments WHERE user_id = ?").get(userId) as { xapi_id: number; number_from: string; number_to: string } | undefined;
  if (!department?.xapi_id || !/^\d+$/.test(department.number_from) || !/^\d+$/.test(department.number_to)) return false;
  const route = savedDefaultRoute(userId);
  return route.extensionOnPbx && route.onPbx;
}

function quietDefaultMessage(message: string) {
  return /no paid plan|waits until|was not found|turned off|enter the company name/i.test(message);
}

function usedNumbers() {
  const database = getDb();
  return [
    ...(database.prepare("SELECT number FROM pbx_extensions WHERE status != 'removed'").all() as { number: string }[]),
    ...(database.prepare("SELECT number FROM call_groups").all() as { number: string }[]),
  ].map((row) => row.number);
}

async function ensureExtension(userId: number, identity: { first: string; last: string; email: string; accountEmail: string; receptionist: boolean }, plan: ReturnType<typeof subscriptionPlan>) {
  const database = getDb();
  const accountEmail = identity.accountEmail.toLowerCase();
  let row = identity.receptionist
    ? database.prepare(
      `SELECT id, number, first_name, xapi_id, ai_name, email FROM pbx_extensions
       WHERE user_id = ? AND status != 'removed' AND (lower(email) = lower(?) OR (ai_role = 'receptionist' AND lower(email) != ?))
       ORDER BY CASE WHEN lower(email) = lower(?) THEN 0 ELSE 1 END, id LIMIT 1`,
    ).get(userId, identity.email, accountEmail, identity.email) as { id: number; number: string; first_name: string; xapi_id: number; ai_name: string; email: string } | undefined
    : database.prepare(
      "SELECT id, number, first_name, xapi_id, ai_name, email FROM pbx_extensions WHERE user_id = ? AND status != 'removed' AND ai_role != 'receptionist' ORDER BY CASE WHEN lower(email) = ? THEN 0 ELSE 1 END, id LIMIT 1",
    ).get(userId, accountEmail) as { id: number; number: string; first_name: string; xapi_id: number; ai_name: string; email: string } | undefined;
  if (row && identity.receptionist && row.email.toLowerCase() === accountEmail) row = undefined;
  if (!row) {
    const taken = database.prepare("SELECT id FROM pbx_extensions WHERE lower(email) = lower(?) AND status != 'removed'").get(identity.email) as { id: number } | undefined;
    if (taken) {
      const which = identity.receptionist ? "AI receptionist" : "default extension";
      return { ok: false as const, message: `The ${which} email ${identity.email} is already used on another extension, so it was not created.` };
    }
    const count = database.prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ? AND status != 'removed'").get(userId) as { n: number };
    if (plan && count.n >= extensionCapacity(plan)) {
      return { ok: false as const, message: identity.receptionist ? "This plan has no room for the AI receptionist extension." : "This plan has no room for the default extension." };
    }
    const { persistNewExtensionRanges, planExtensionRanges } = await import("./extension-plan");
    const reserved = planExtensionRanges();
    persistNewExtensionRanges(reserved.ranges);
    const allocated = await allocateExtension(userId, usedNumbers(), reserved.plan, reserved.ranges);
    if (!allocated.ok) return { ok: false as const, message: `${identity.receptionist ? "The AI receptionist extension" : "The default extension"} was not created. ${allocated.message}` };
    const info = database.prepare(
      "INSERT INTO pbx_extensions (user_id, number, first_name, last_name, email, status, access_password, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)",
    ).run(userId, allocated.number, identity.first, identity.last, identity.email, appPassword(), new Date().toISOString());
    row = { id: Number(info.lastInsertRowid), number: allocated.number, first_name: identity.first, xapi_id: 0, ai_name: "", email: identity.email };
  }
  if (!row.xapi_id) {
    const result = await provisionExtension(row.id);
    const refreshed = database.prepare(
      "SELECT id, number, first_name, xapi_id, ai_name, email FROM pbx_extensions WHERE id = ?",
    ).get(row.id) as { id: number; number: string; first_name: string; xapi_id: number; ai_name: string; email: string } | undefined;
    if (!result.ok || !refreshed?.xapi_id) {
      const detail = "detail" in result && result.detail ? String(result.detail) : result.message;
      const which = identity.receptionist ? "AI receptionist extension" : "default extension";
      return { ok: false as const, message: `The ${which} was not created on 3CX. ${detail}` };
    }
    row = refreshed;
  }
  return { ok: true as const, id: row.id, number: row.number, first: row.first_name, aiName: row.ai_name };
}

async function ensureRing(userId: number, extensionId: number) {
  const database = getDb();
  let group = database.prepare(
    "SELECT * FROM call_groups WHERE user_id = ? AND kind = 'ring' ORDER BY CASE WHEN name = 'Main' THEN 0 ELSE 1 END, answers DESC, id LIMIT 1",
  ).get(userId) as CallGroup | undefined;
  if (!group) {
    const created = await createCallGroup({ userId, kind: "ring", name: "Main", strategy: "ring_all", extensionIds: [extensionId] });
    const groupId = "groupId" in created ? created.groupId : 0;
    group = groupId ? database.prepare("SELECT * FROM call_groups WHERE id = ?").get(groupId) as CallGroup | undefined : undefined;
    if (!group?.xapi_id) return { ok: false as const, message: `The ring group was not created on 3CX. ${group?.last_message || created.message}` };
  } else {
    const members = groupMembers(group.id);
    const included = members.some((member) => member.extension_id === extensionId);
    if (!included) database.prepare("INSERT INTO call_group_members (group_id, extension_id, position) VALUES (?, ?, ?)").run(group.id, extensionId, members.length);
    if (!group.xapi_id || !included) {
      const result = await provisionCallGroup(group.id);
      group = database.prepare("SELECT * FROM call_groups WHERE id = ?").get(group.id) as CallGroup | undefined;
      if (!result.ok || !group?.xapi_id) return { ok: false as const, message: `The ring group was not created on 3CX. ${result.message}` };
    }
  }
  await setDaytimeGroup(userId, group.id);
  return { ok: true as const, name: group.name, number: group.number };
}

export async function ensureTrunkDefaults(userId: number): Promise<TrunkDefaults> {
  const paid = getDb().prepare("SELECT id FROM payment_attempts WHERE user_id = ? AND status = 'paid' AND plan_name != '' AND COALESCE(product_kind, '') != 'bundle' LIMIT 1").get(userId) as { id: number } | undefined;
  if (!paid) return { ok: false, message: "No paid plan is on this account. The department, default extension, and default route were not created." };
  const existingExtension = getDb().prepare("SELECT id FROM pbx_extensions WHERE user_id = ? AND status != 'removed' LIMIT 1").get(userId) as { id: number } | undefined;
  const check = verificationStatus(userId);
  if (!existingExtension && !extensionReady({ paid: true, emailVerified: check.emailVerified, phoneVerified: check.phoneVerified, emailRequired: check.emailRequired, smsRequired: check.smsRequired })) {
    return { ok: false, message: "The first extension waits until the required email and mobile confirmation are done." };
  }
  const user = getDb().prepare("SELECT name, business_name, email FROM users WHERE id = ?").get(userId) as { name: string; business_name: string; email: string } | undefined;
  if (!user) return { ok: false, message: "That account was not found. The department and default route were not created." };
  const company = accountDepartmentName(user.business_name || "", user.name || "");
  if (!company) {
    const issue = departmentNameIssue(accountDisplayName(user.business_name || "", user.name || ""));
    return { ok: false, message: issue || "Enter the company name. That name becomes the department, and the trunk is limited to it." };
  }
  const named = await applyDepartmentName(userId, company);
  if (!named.ok) return { ok: false, message: `${named.message} The department was not created.` };
  const department = getDb().prepare("SELECT name, xapi_id, number_from, number_to FROM pbx_departments WHERE user_id = ?").get(userId) as { name: string; xapi_id: number; number_from: string; number_to: string } | undefined;
  if (!department?.xapi_id) {
    return {
      ok: false,
      message: flagOn("pbx.live_provision")
        ? `Department ${company} was not created on 3CX.`
        : "Creating people on the phone system is turned off, so the department was not created on 3CX.",
    };
  }
  if (!/^\d+$/.test(department.number_from) || !/^\d+$/.test(department.number_to)) {
    return { ok: false, message: `Department ${company} has no extension range, so the outbound rule was not created.` };
  }
  const from = department.number_from;
  const to = department.number_to;
  const plan = subscriptionPlan(userId);
  if (plan && planAllows(plan, "ai")) {
    const email = receptionistAddress(user.email, userId);
    if (!email) return { ok: false, message: "The account has no email, so the AI receptionist extension was not created." };
    const extension = await ensureExtension(userId, { first: "AI", last: "Receptionist", email, accountEmail: user.email, receptionist: true }, plan);
    if (!extension.ok) return extension;
    const assigned = assignExtensionAi(userId, plan, extension.id, "receptionist", extension.aiName || "AI Receptionist");
    if (!assigned.ok) return { ok: false, message: `${assigned.message} The AI receptionist was not saved, so the trunk was left unchanged.` };
    getDb().prepare("UPDATE call_groups SET answers = 0 WHERE user_id = ?").run(userId);
    await updateRouting(userId);
    const target = defaultTrunkDestination({ ai: true, aiExtension: extension.number, ringName: "", ringNumber: "" });
    if (!target) return { ok: false, message: "The AI receptionist extension was not created, so the trunk was left unchanged." };
    return {
      ok: true,
      departmentId: department.xapi_id,
      departmentName: department.name,
      from,
      to,
      extensionNumber: extension.number,
      target,
    };
  }
  const person = signupPersonName(user.name, user.email);
  const extension = await ensureExtension(userId, { first: person.first, last: person.last, email: user.email, accountEmail: user.email, receptionist: false }, plan);
  if (!extension.ok) return extension;
  const ring = await ensureRing(userId, extension.id);
  if (!ring.ok) return { ok: false, message: `Extension ${extension.number} is on 3CX. ${ring.message}` };
  const target = defaultTrunkDestination({ ai: false, aiExtension: "", ringName: ring.name, ringNumber: ring.number });
  if (!target) return { ok: false, message: `Extension ${extension.number} is on 3CX. The ring group was not created, so the trunk was left unchanged.` };
  return {
    ok: true,
    departmentId: department.xapi_id,
    departmentName: department.name,
    from,
    to,
    extensionNumber: extension.number,
    target,
  };
}

export async function runScheduledDefaults(userId: number) {
  if (!userId || defaultsSettled(userId)) return;
  const result = await ensureTrunkDefaults(userId);
  if (result.ok || quietDefaultMessage(result.message)) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const existing = getDb().prepare(
    "SELECT id FROM failure_log WHERE area = 'extension' AND user_id = ? AND detail = ? AND created_at >= ? LIMIT 1",
  ).get(userId, result.message, since) as { id: number } | undefined;
  if (!existing) recordFailure({ area: "extension", userId, subject: "default extension", detail: result.message });
}

export function scheduleDefaultAccount(userId: number) {
  if (!userId) return;
  finishAfterResponse(() => runScheduledDefaults(userId));
}
