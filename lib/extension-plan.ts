import { getDb, readDoc } from "./db";
import { assignBlocks, defaultExtensionPlan, keptRange, normalizeExtensionPlan, replacementExtension, type AssignedRange, type ExtensionPlan, type RangeCustomer } from "./extension-numbers";
import { extensionCapacity, normalizePlans } from "./plan-features";
import type { Plan } from "./types";

export function readExtensionPlan(): ExtensionPlan {
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get("extension_plan") as { json: string } | undefined;
  if (!row) return defaultExtensionPlan;
  try {
    return normalizeExtensionPlan(JSON.parse(row.json));
  } catch {
    return defaultExtensionPlan;
  }
}

type DepartmentRange = { user_id: number; number_from: string; number_to: string; xapi_id: number };

export function planExtensionRanges(): { plan: ExtensionPlan; ranges: AssignedRange[] } {
  const plan = readExtensionPlan();
  const database = getDb();
  const plans = normalizePlans(readDoc<Plan[]>("plans"));
  const payments = database.prepare(
    "SELECT user_id, plan_name FROM payment_attempts WHERE status = 'paid' AND plan_name != '' ORDER BY id DESC",
  ).all() as { user_id: number; plan_name: string }[];
  const seatsByUser = new Map<number, number>();
  for (const payment of payments) {
    if (seatsByUser.has(payment.user_id)) continue;
    const match = plans.find((item) => item.name === payment.plan_name && !item.custom);
    if (!match) continue;
    seatsByUser.set(payment.user_id, extensionCapacity(match));
  }
  const departments = database.prepare("SELECT user_id, number_from, number_to, xapi_id FROM pbx_departments").all() as DepartmentRange[];
  const extensions = database.prepare("SELECT user_id, number FROM pbx_extensions").all() as { user_id: number; number: string }[];
  const ids = new Set<number>([
    ...seatsByUser.keys(),
    ...departments.map((row) => row.user_id),
    ...extensions.map((row) => row.user_id),
  ]);
  const customers: RangeCustomer[] = [...ids].flatMap((id) => {
    const department = departments.find((row) => row.user_id === id);
    const from = Number(department?.number_from);
    const to = Number(department?.number_to);
    const saved = Number.isInteger(from) && Number.isInteger(to) && from > 0 && to >= from;
    const numbers = extensions
      .filter((row) => row.user_id === id)
      .map((row) => Number(row.number))
      .filter((number) => Number.isInteger(number) && number >= plan.start);
    const rawFrom = saved ? from : numbers.length ? Math.min(...numbers) : undefined;
    const rawTo = saved ? to : numbers.length ? Math.max(...numbers) : undefined;
    const kept = keptRange(plan.start, rawFrom, rawTo);
    const width = kept ? kept.to - kept.from + 1 : 0;
    const seats = seatsByUser.get(id) || width;
    if (seats < 1 && !kept) return [];
    return [{ id, seats, from: kept?.from, to: kept?.to, locked: Boolean(department?.xapi_id && kept) }];
  });
  return { plan, ranges: assignBlocks(plan.start, customers) };
}

export function persistNewExtensionRanges(ranges: AssignedRange[]) {
  const database = getDb();
  const write = database.prepare(
    `INSERT INTO pbx_departments (user_id, name, xapi_id, number_from, number_to, open_time, close_time, last_message)
     VALUES (?, ?, 0, ?, ?, '09:00', '17:00', '')
     ON CONFLICT(user_id) DO UPDATE SET number_from = excluded.number_from, number_to = excluded.number_to
     WHERE pbx_departments.xapi_id = 0`,
  );
  const save = database.transaction((rows: AssignedRange[]) => {
    for (const range of rows) write.run(range.id, `SautiCall ${range.id}`, String(range.from), String(range.to));
  });
  save(ranges);
}

export function shiftPendingExtensions(plan = readExtensionPlan()) {
  const database = getDb();
  const pending = database.prepare(
    "SELECT id, user_id, number FROM pbx_extensions WHERE xapi_id = 0 AND status NOT IN ('created', 'manual') ORDER BY id",
  ).all() as { id: number; user_id: number; number: string }[];
  const below = pending.filter((row) => !(Number(row.number) >= plan.start));
  if (!below.length) return [] as { id: number; from: string; to: string }[];
  const reserved = planExtensionRanges();
  const taken = new Set<string>([
    ...(database.prepare("SELECT number FROM pbx_extensions").all() as { number: string }[]).map((row) => row.number),
    ...(database.prepare("SELECT number FROM call_groups").all() as { number: string }[]).map((row) => row.number),
  ]);
  const update = database.prepare("UPDATE pbx_extensions SET number = ? WHERE id = ? AND xapi_id = 0");
  const moved: { id: number; from: string; to: string }[] = [];
  database.transaction(() => {
    for (const row of below) {
      const next = replacementExtension(row.number, plan.start, [...taken], row.user_id, reserved.ranges, reserved.plan);
      if (!next || next === row.number) continue;
      update.run(next, row.id);
      taken.delete(row.number);
      taken.add(next);
      moved.push({ id: row.id, from: row.number, to: next });
    }
  })();
  return moved;
}
