import { accountKindChoice, clientMailbox, kindFromPlan, nextCustomerCode, type CustomerKind } from "./customer-code";
import { getDb, readDoc } from "./db";
import { paidPlan } from "./pbx";
import type { Plan } from "./types";

function planByName(name: string) {
  const plans = readDoc<Plan[]>("plans") || [];
  return plans.find((plan) => plan.name.trim().toLowerCase() === name.trim().toLowerCase()) || null;
}

function kindForExisting(userId: number): CustomerKind {
  const stored = getDb().prepare("SELECT account_kind FROM users WHERE id = ?").get(userId) as { account_kind?: string } | undefined;
  const chosen = accountKindChoice(stored?.account_kind || "");
  if (chosen) return chosen;
  const paid = paidPlan(userId);
  if (paid) return kindFromPlan(paid);
  const setup = getDb().prepare("SELECT payload FROM account_requests WHERE user_id = ? AND kind = 'setup' ORDER BY id DESC LIMIT 1").get(userId) as { payload: string } | undefined;
  if (!setup?.payload) return "individual";
  try {
    const name = String((JSON.parse(setup.payload) as { plan?: string }).plan || "");
    return name ? kindFromPlan(planByName(name)) : "individual";
  } catch {
    return "individual";
  }
}

function writeCode(userId: number, kind: CustomerKind) {
  const database = getDb();
  const assign = database.transaction(() => {
    const current = database.prepare("SELECT customer_code FROM users WHERE id = ? AND role = 'customer'").get(userId) as { customer_code: string } | undefined;
    if (!current) return "";
    if (current.customer_code) return current.customer_code;
    const codes = database.prepare("SELECT customer_code FROM users WHERE customer_code != ''").all() as { customer_code: string }[];
    const code = nextCustomerCode(kind, codes.map((row) => row.customer_code));
    const saved = database.prepare("UPDATE users SET customer_code = ? WHERE id = ? AND customer_code = ''").run(code, userId);
    if (saved.changes === 1) return code;
    const again = database.prepare("SELECT customer_code FROM users WHERE id = ?").get(userId) as { customer_code: string } | undefined;
    return again?.customer_code || "";
  });
  return assign();
}

export function ensureCustomerCode(userId: number, planName = "") {
  const row = getDb().prepare("SELECT customer_code, role, account_kind FROM users WHERE id = ?").get(userId) as { customer_code: string; role: string; account_kind?: string } | undefined;
  if (!row || row.role !== "customer") return "";
  if (row.customer_code) return row.customer_code;
  const chosen = accountKindChoice(row.account_kind || "");
  const kind = chosen || (planName.trim() ? kindFromPlan(planByName(planName)) : kindForExisting(userId));
  try {
    return writeCode(userId, kind);
  } catch {
    return writeCode(userId, kind);
  }
}

export function customerMailbox(userId: number, personalEmail = "") {
  const code = ensureCustomerCode(userId);
  const mailbox = clientMailbox(code);
  if (!mailbox) return "";
  if (personalEmail && mailbox.toLowerCase() === personalEmail.trim().toLowerCase()) return "";
  return mailbox;
}
