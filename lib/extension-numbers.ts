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

export type AssignedRange = { id: number; from: number; to: number };

export type RangeCustomer = {
  id: number;
  seats: number;
  from?: number;
  to?: number;
  locked?: boolean;
};

function overlaps(from: number, to: number, ranges: AssignedRange[]) {
  return ranges.some((range) => from <= range.to && range.from <= to);
}

export function assignBlocks(start: number, customers: RangeCustomer[]): AssignedRange[] {
  const placed: AssignedRange[] = [];
  const saved = customers
    .filter((customer) => Number.isInteger(customer.from) && Number.isInteger(customer.to) && (customer.to as number) >= (customer.from as number) && (customer.from as number) > 0)
    .sort((left, right) => left.id - right.id);
  for (const customer of saved) {
    let from = customer.from as number;
    let to = customer.to as number;
    const seats = Math.max(customer.seats, 1);
    if (!customer.locked && seats > to - from + 1) {
      const grownTo = from + seats - 1;
      if (!overlaps(from, grownTo, placed)) to = grownTo;
    }
    placed.push({ id: customer.id, from, to });
  }
  const pending = customers
    .filter((customer) => customer.seats > 0 && !placed.some((range) => range.id === customer.id))
    .sort((left, right) => left.id - right.id);
  for (const customer of pending) {
    const width = customer.seats;
    let from = Math.max(start, 1);
    for (let guard = 0; guard < 100000 && overlaps(from, from + width - 1, placed); guard += 1) {
      const hit = placed.find((range) => from <= range.to && from + width - 1 >= range.from);
      const next = (hit?.to ?? from) + 1;
      from = next > from ? next : from + 1;
    }
    placed.push({ id: customer.id, from, to: from + width - 1 });
  }
  return placed.sort((left, right) => left.id - right.id);
}

export function numbersInRanges(ranges: { from: number; to: number }[]) {
  const numbers: string[] = [];
  for (const range of ranges) {
    const last = Math.min(range.to, range.from + 499);
    for (let number = range.from; number <= last; number += 1) numbers.push(String(number));
  }
  return numbers;
}

export function keptRange(start: number, from?: number, to?: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || (to as number) < (from as number) || (from as number) <= 0) return undefined;
  if ((to as number) < start) return undefined;
  return { from: Math.max(from as number, start), to: to as number };
}

export function replacementExtension(current: string, start: number, taken: string[], userId: number, ranges: AssignedRange[], plan: ExtensionPlan) {
  const numeric = Number(current);
  if (Number.isInteger(numeric) && numeric >= start && !taken.includes(current)) return current;
  return chooseExtension(userId, [...taken, current], [], plan, ranges);
}

export function chooseExtension(userId: number, taken: string[], customerIds: number[], plan: ExtensionPlan = defaultExtensionPlan, ranges?: AssignedRange[]) {
  const used = new Set(taken);
  const list = ranges ?? customerIds.map((id) => ({ id, ...extensionRange(id, plan) }));
  const reserved = new Set<string>();
  for (const range of list) {
    if (range.id === userId) continue;
    for (let number = range.from; number <= range.to; number += 1) reserved.add(String(number));
  }
  const own = list.find((range) => range.id === userId);
  if (own) {
    for (let number = own.from; number <= own.to; number += 1) {
      const value = String(number);
      if (!used.has(value)) return value;
    }
  }
  for (let number = plan.start; number < plan.start + plan.span; number += 1) {
    const value = String(number);
    if (used.has(value) || reserved.has(value)) continue;
    return value;
  }
  return "";
}
