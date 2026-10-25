import { getDb, readDoc } from "./db";
import { assignBlocks, defaultExtensionPlan, normalizeExtensionPlan, type AssignedRange, type ExtensionPlan, type RangeCustomer } from "./extension-numbers";
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
      .filter((number) => Number.isInteger(number) && number > 0);
    const knownFrom = saved ? from : numbers.length ? Math.min(...numbers) : undefined;
    const knownTo = saved ? to : numbers.length ? Math.max(...numbers) : undefined;
    const width = knownFrom && knownTo ? knownTo - knownFrom + 1 : 0;
    const seats = seatsByUser.get(id) || width;
    if (seats < 1 && !knownFrom) return [];
    return [{ id, seats, from: knownFrom, to: knownTo, locked: Boolean(department?.xapi_id) }];
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
