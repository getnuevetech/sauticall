import { configuredCurrency } from "./catalog";
import { getDb } from "./db";

export function checkoutCurrency() {
  const rows = getDb().prepare("SELECT currencies FROM gateways WHERE enabled = 1").all() as { currencies: string }[];
  return configuredCurrency(rows.map((row) => row.currencies || ""));
}

export function latestPaidPlanCounts() {
  const rows = getDb().prepare("SELECT user_id, plan_name FROM payment_attempts WHERE status = 'paid' AND product_kind != 'bundle' AND plan_name != '' ORDER BY id DESC").all() as { user_id: number; plan_name: string }[];
  const seen = new Set<number>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    counts.set(row.plan_name, (counts.get(row.plan_name) || 0) + 1);
  }
  return counts;
}

export function bundlePurchaseCounts() {
  const rows = getDb().prepare("SELECT bundle_name, COUNT(*) AS n FROM payment_attempts WHERE status = 'paid' AND product_kind = 'bundle' AND bundle_name != '' GROUP BY bundle_name").all() as { bundle_name: string; n: number }[];
  return Object.fromEntries(rows.map((row) => [row.bundle_name, row.n]));
}
