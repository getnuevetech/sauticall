export type ExtensionPlan = {
  start: number;
  block: number;
  span: number;
  ringStart: number;
  queueStart: number;
  groupSpan: number;
};

export const defaultExtensionPlan: ExtensionPlan = {
  start: 2000,
  block: 10,
  span: 5000,
  ringStart: 800,
  queueStart: 900,
  groupSpan: 5000,
};

function whole(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function extensionPlanError(plan: ExtensionPlan) {
  if (plan.start < 100 || plan.start > 90000) return "The first extension must be a whole number from 100 to 90000.";
  if (plan.block < 1 || plan.block > 500) return "Each customer needs between 1 and 500 extensions.";
  if (plan.span < plan.block || plan.span > 50000) return "The person search has to cover at least one customer block, and no more than 50000 numbers.";
  if (plan.ringStart < 100 || plan.ringStart > 90000) return "The first ring group must be a whole number from 100 to 90000.";
  if (plan.queueStart < 100 || plan.queueStart > 90000) return "The first call queue must be a whole number from 100 to 90000.";
  if (plan.groupSpan < 1 || plan.groupSpan > 50000) return "The group search has to cover between 1 and 50000 numbers.";
  const starts = new Set([plan.start, plan.ringStart, plan.queueStart]);
  if (starts.size < 3) return "People, ring groups, and call queues need different starting numbers.";
  return "";
}

export function normalizeExtensionPlan(value: unknown): ExtensionPlan {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const plan: ExtensionPlan = {
    start: whole(record.start) ?? defaultExtensionPlan.start,
    block: whole(record.block) ?? defaultExtensionPlan.block,
    span: whole(record.span) ?? defaultExtensionPlan.span,
    ringStart: whole(record.ringStart) ?? defaultExtensionPlan.ringStart,
    queueStart: whole(record.queueStart) ?? defaultExtensionPlan.queueStart,
    groupSpan: whole(record.groupSpan) ?? defaultExtensionPlan.groupSpan,
  };
  return extensionPlanError(plan) ? defaultExtensionPlan : plan;
}

export function extensionPlanFromFields(fields: Record<string, string>): { ok: true; plan: ExtensionPlan } | { ok: false; message: string } {
  const plan: ExtensionPlan = {
    start: whole(fields.start) ?? -1,
    block: whole(fields.block) ?? -1,
    span: whole(fields.span) ?? -1,
    ringStart: whole(fields.ringStart) ?? -1,
    queueStart: whole(fields.queueStart) ?? -1,
    groupSpan: whole(fields.groupSpan) ?? -1,
  };
  const message = extensionPlanError(plan);
  if (message) return { ok: false, message };
  return { ok: true, plan };
}

export function extensionRange(userId: number, plan: ExtensionPlan = defaultExtensionPlan) {
  const from = plan.start + (Math.max(userId, 1) - 1) * plan.block;
  return { from, to: from + plan.block - 1 };
}

export function chooseExtension(userId: number, taken: string[], customerIds: number[], plan: ExtensionPlan = defaultExtensionPlan) {
  const used = new Set(taken);
  const reserved = new Set<string>();
  for (const id of customerIds) {
    if (id === userId) continue;
    const range = extensionRange(id, plan);
    for (let number = range.from; number <= range.to; number += 1) reserved.add(String(number));
  }
  const own = extensionRange(userId, plan);
  for (let number = own.from; number <= own.to; number += 1) {
    const value = String(number);
    if (!used.has(value)) return value;
  }
  for (let number = plan.start; number < plan.start + plan.span; number += 1) {
    const value = String(number);
    if (used.has(value) || reserved.has(value)) continue;
    return value;
  }
  return "";
}
