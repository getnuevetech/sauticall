import { verificationStatus } from "./account-verify";
import { appPassword } from "./app-password";
import { createCallGroup, setDaytimeGroup } from "./call-groups";
import { extensionReady, signupPersonName } from "./default-setup";
import { flagOn, getDb } from "./db";
import { persistNewExtensionRanges, planExtensionRanges } from "./extension-plan";
import { recordFailure } from "./failure-log";
import { finishAfterResponse } from "./later";
import { allocateExtension, applyDepartmentName, extensionCapacity, paidPlan, provisionExtension } from "./pbx";
import { accountDepartmentName, acceptedDepartmentName, departmentNameIssue } from "./pbx-user";
import { planAllows } from "./plan-features";

export type DefaultAccount = {
  ok: boolean;
  ready: boolean;
  ai: boolean;
  extension: string;
  extensionId: number;
  ringGroup: string;
  message: string;
};

const empty: DefaultAccount = { ok: false, ready: false, ai: false, extension: "", extensionId: 0, ringGroup: "", message: "That account was not found." };

function hasPaidSubscription(userId: number) {
  const row = getDb().prepare(
    "SELECT id FROM payment_attempts WHERE user_id = ? AND status = 'paid' AND plan_name != '' AND COALESCE(product_kind, '') != 'bundle' LIMIT 1",
  ).get(userId) as { id: number } | undefined;
  return Boolean(row);
}

function firstExtension(userId: number) {
  return getDb().prepare(
    "SELECT id, number, ai_role, xapi_id FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY id LIMIT 1",
  ).get(userId) as { id: number; number: string; ai_role: string; xapi_id: number } | undefined;
}

function ringFor(userId: number, extensionId: number) {
  if (!extensionId) return undefined;
  return getDb().prepare(
    `SELECT g.id, g.number, g.answers FROM call_groups g
     JOIN call_group_members m ON m.group_id = g.id
     WHERE g.user_id = ? AND g.kind = 'ring' AND m.extension_id = ?
     ORDER BY g.answers DESC, g.id LIMIT 1`,
  ).get(userId, extensionId) as { id: number; number: string; answers: number } | undefined;
}

export async function ensureDefaultAccount(userId: number): Promise<DefaultAccount> {
  const person = getDb().prepare("SELECT name, email, business_name FROM users WHERE id = ? AND role = 'customer'").get(userId) as { name: string; email: string; business_name: string } | undefined;
  if (!person?.email) return empty;
  const check = verificationStatus(userId);
  const ready = extensionReady({
    paid: hasPaidSubscription(userId),
    emailVerified: check.emailVerified,
    phoneVerified: check.phoneVerified,
    emailRequired: check.emailRequired,
    smsRequired: check.smsRequired,
  });
  if (!ready) {
    return { ok: true, ready: false, ai: false, extension: "", extensionId: 0, ringGroup: "", message: "The first extension waits until the subscription is paid and the required email and mobile confirmation are done." };
  }
  const plan = paidPlan(userId);
  const department = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(userId) as { name: string } | undefined;
  if (!acceptedDepartmentName(department?.name || "")) {
    const chosen = accountDepartmentName(person.business_name || "", person.name || "");
    const issue = departmentNameIssue(chosen);
    if (issue) {
      recordFailure({ area: "extension", userId, subject: person.email, detail: issue });
      return { ...empty, ok: false, ready: true, message: issue };
    }
    const applied = await applyDepartmentName(userId, chosen);
    if (!applied.ok) {
      recordFailure({ area: "extension", userId, subject: person.email, detail: applied.detail || applied.message });
      return { ...empty, ok: false, ready: true, message: applied.message };
    }
  }
  let extension = firstExtension(userId);
  if (!extension) {
    const taken = getDb().prepare("SELECT id, user_id FROM pbx_extensions WHERE lower(email) = lower(?) AND status != 'removed'").get(person.email) as { id: number; user_id: number } | undefined;
    if (taken && taken.user_id !== userId) {
      const message = "The signup email is already used for an extension on another account, so the default extension was not created.";
      recordFailure({ area: "extension", userId, subject: person.email, detail: message });
      return { ...empty, ok: false, ready: true, message };
    }
    const count = getDb().prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ? AND status != 'removed'").get(userId) as { n: number };
    if (count.n >= extensionCapacity(plan)) {
      return { ...empty, ok: false, ready: true, message: "This plan has no room for the default extension." };
    }
    const used = [
      ...(getDb().prepare("SELECT number FROM pbx_extensions WHERE status != 'removed'").all() as { number: string }[]),
      ...(getDb().prepare("SELECT number FROM call_groups").all() as { number: string }[]),
    ].map((row) => row.number);
    const reserved = planExtensionRanges();
    persistNewExtensionRanges(reserved.ranges);
    const allocated = await allocateExtension(userId, used, reserved.plan, reserved.ranges);
    if (!allocated.ok) {
      recordFailure({ area: "extension", userId, subject: person.email, detail: allocated.message });
      return { ...empty, ok: false, ready: true, message: allocated.message };
    }
    const again = firstExtension(userId);
    if (again) extension = again;
    else {
      const names = signupPersonName(person.name || "");
      const info = getDb().prepare(
        "INSERT INTO pbx_extensions (user_id, number, first_name, last_name, email, status, access_password, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)",
      ).run(userId, allocated.number, names.first, names.last, person.email, appPassword(), new Date().toISOString());
      const extensionId = Number(info.lastInsertRowid);
      if (flagOn("pbx.live_provision")) {
        const created = await provisionExtension(extensionId);
        if (!created.ok) recordFailure({ area: "extension", userId, subject: allocated.number, detail: created.message });
      }
      extension = firstExtension(userId);
    }
  }
  if (!extension) return { ...empty, ok: false, ready: true, message: "The default extension was not created." };
  const receptionist = planAllows(plan, "ai");
  if (receptionist && !extension.ai_role) {
    const { assignExtensionAi } = await import("./ai-account-store");
    const names = signupPersonName(person.name || "");
    const assigned = assignExtensionAi(userId, plan, extension.id, "receptionist", `${names.first} ${names.last}`.trim());
    if (!assigned.ok) recordFailure({ area: "extension", userId, subject: extension.number, detail: assigned.message });
    extension = firstExtension(userId) || extension;
  }
  let ringGroup = "";
  if (!receptionist) {
    let ring = ringFor(userId, extension.id);
    if (!ring) {
      const created = await createCallGroup({ userId, kind: "ring", name: "Main", strategy: "ring_all", extensionIds: [extension.id] });
      if (!created.ok) recordFailure({ area: "group", userId, subject: extension.number, detail: created.message });
      ring = ringFor(userId, extension.id);
    }
    if (ring && !ring.answers) await setDaytimeGroup(userId, ring.id);
    ring = ringFor(userId, extension.id);
    ringGroup = ring?.number || "";
  }
  const route = receptionist ? `AI extension ${extension.number}` : ringGroup ? `ring group ${ringGroup}` : `extension ${extension.number}`;
  return { ok: true, ready: true, ai: receptionist, extension: extension.number, extensionId: extension.id, ringGroup, message: `Default route is ${route}. Outbound calls use this company's department.` };
}

export function scheduleDefaultAccount(userId: number) {
  if (!userId) return;
  finishAfterResponse(() => ensureDefaultAccount(userId));
}

export function scheduleReadyAccounts() {
  const rows = getDb().prepare(
    `SELECT u.id FROM users u
     WHERE u.role = 'customer'
     AND EXISTS (
       SELECT 1 FROM payment_attempts p
       WHERE p.user_id = u.id AND p.status = 'paid' AND p.plan_name != '' AND COALESCE(p.product_kind, '') != 'bundle'
     )`,
  ).all() as { id: number }[];
  for (const row of rows) scheduleDefaultAccount(row.id);
}
