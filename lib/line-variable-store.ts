import { getDb } from "./db";
import { audienceOf, billingDays, LINE_VARIABLES, type LineVariable, resolveVariable } from "./line-variables";

export function ensureLineVariables() {
  const insert = getDb().prepare(
    "INSERT INTO line_variables (key, label, detail, admin_value, audience, kind) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING",
  );
  const refresh = getDb().prepare("UPDATE line_variables SET label = ?, detail = ? WHERE key = ?");
  for (const item of LINE_VARIABLES) {
    insert.run(item.key, item.label, item.detail, item.adminValue, item.audience, item.kind);
    refresh.run(item.label, item.detail, item.key);
  }
}

export function listLineVariables(): LineVariable[] {
  ensureLineVariables();
  const rows = getDb().prepare("SELECT key, label, detail, admin_value, audience, kind FROM line_variables ORDER BY rowid").all() as {
    key: string;
    label: string;
    detail: string;
    admin_value: string;
    audience: string;
    kind: string;
  }[];
  const known = new Map(LINE_VARIABLES.map((item) => [item.key, item]));
  return rows.map((row) => {
    const seed = known.get(row.key);
    return {
      key: row.key,
      label: row.label || seed?.label || row.key,
      detail: row.detail || seed?.detail || "",
      adminValue: row.admin_value,
      audience: audienceOf(row.audience),
      kind: row.kind === "days" ? "days" : "text",
    };
  });
}

export function customerValues(userId: number) {
  const rows = getDb().prepare("SELECT key, value FROM customer_line_values WHERE user_id = ?").all(userId) as { key: string; value: string }[];
  return new Map(rows.map((row) => [row.key, row.value]));
}

export function resolvedLineValue(userId: number, key: string) {
  const variable = listLineVariables().find((item) => item.key === key);
  if (!variable) return "";
  return resolveVariable(variable, customerValues(userId).get(key) || "");
}

export function planPaidAt(userId: number) {
  const row = getDb().prepare(
    "SELECT paid_at, created_at FROM payment_attempts WHERE user_id = ? AND status = 'paid' AND product_kind != 'bundle' AND plan_name != '' ORDER BY id ASC LIMIT 1",
  ).get(userId) as { paid_at: string; created_at: string } | undefined;
  return row?.paid_at || row?.created_at || "";
}

export function saveLineVariables(rows: { key: string; adminValue: string; audience: string }[]) {
  const current = new Map(listLineVariables().map((item) => [item.key, item]));
  const update = getDb().prepare("UPDATE line_variables SET admin_value = ?, audience = ? WHERE key = ?");
  for (const row of rows) {
    const variable = current.get(row.key);
    if (!variable) continue;
    const raw = row.adminValue.trim();
    const value = variable.kind === "days" ? (raw === "" ? "" : raw === "0" ? "0" : String(billingDays(raw))) : raw.slice(0, 200);
    update.run(value, audienceOf(row.audience), row.key);
  }
}

export function saveCustomerLineValues(userId: number, entries: { key: string; value: string }[]) {
  const variables = new Map(listLineVariables().map((item) => [item.key, item]));
  const write = getDb().prepare(
    "INSERT INTO customer_line_values (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
  );
  for (const entry of entries) {
    const variable = variables.get(entry.key);
    if (!variable || variable.audience === "admin" || (variable.audience === "both" && variable.adminValue.trim())) continue;
    const value = variable.kind === "days" ? String(billingDays(entry.value)) : entry.value.trim().slice(0, 200);
    write.run(userId, entry.key, value);
  }
}
