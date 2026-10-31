import { formatPhone } from "./account-display";
import { shownAccountName } from "./pbx-user";
import { ensureCustomerCode } from "./customer-code-store";
import { contactLines, matchesCustomer, type CustomerFilters } from "./customer-view";
import { getDb } from "./db";
import { addressReady, formatAddress } from "./e911-address";
import { getEmergency } from "./e911";
import { extensionCapacity } from "./plan-features";
import { paidPlan } from "./pbx";

export type { CustomerFilters };
export { contactLines, matchesCustomer };

export type CustomerRow = {
  id: number;
  code: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  phoneLabel: string;
  plan: string;
  numbers: number;
  tickets: number;
  disabled: boolean;
  joined: string;
};

type Raw = {
  id: number;
  name: string;
  email: string;
  phone: string;
  disabled: number;
  created_at: string;
  customer_code: string;
  business_name: string;
  department: string;
  plan_name: string | null;
  numbers: number;
  open_tickets: number;
};

function companyName(department: string, business: string, name: string) {
  return shownAccountName(department, business, name) || name || "Customer";
}

export function listCustomerAccounts(filters: CustomerFilters) {
  const database = getDb();
  const missing = database.prepare("SELECT id FROM users WHERE role = 'customer' AND customer_code = ''").all() as { id: number }[];
  for (const person of missing) ensureCustomerCode(person.id);
  const people = database.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.disabled, u.created_at, u.customer_code, u.business_name,
            COALESCE(d.name, '') AS department,
            (SELECT plan_name FROM payment_attempts p WHERE p.user_id = u.id AND p.status = 'paid' AND IFNULL(p.product_kind, 'plan') != 'bundle' AND p.plan_name != '' ORDER BY p.id DESC LIMIT 1) AS plan_name,
            (SELECT COUNT(*) FROM phone_lines l WHERE l.user_id = u.id) AS numbers,
            (SELECT COUNT(*) FROM tickets t WHERE t.user_id = u.id AND t.status NOT IN ('resolved', 'closed')) AS open_tickets
     FROM users u
     LEFT JOIN pbx_departments d ON d.user_id = u.id
     WHERE u.role = 'customer'
     ORDER BY u.name COLLATE NOCASE, u.email`,
  ).all() as Raw[];
  const rows = people.map((person): CustomerRow => {
    const contact = person.name || person.email;
    return {
      id: person.id,
      code: person.customer_code,
      company: companyName(person.department, person.business_name || "", contact),
      contact,
      email: person.email,
      phone: person.phone || "",
      phoneLabel: person.phone ? formatPhone(person.phone) : "",
      plan: person.plan_name || "No paid plan",
      numbers: person.numbers,
      tickets: person.open_tickets,
      disabled: person.disabled === 1,
      joined: person.created_at,
    };
  });
  const plans = [...new Set(rows.map((row) => row.plan))].sort((a, b) => a.localeCompare(b));
  const signin = filters.signin === "enabled" || filters.signin === "disabled" ? filters.signin : "all";
  const visible = rows.filter((row) => matchesCustomer(row, { ...filters, signin: "all" }) && (signin === "all" || (signin === "disabled" ? row.disabled : !row.disabled)));
  return { rows: visible, plans, total: rows.length };
}

export function customerSnapshot(userId: number) {
  const row = listCustomerAccounts({ q: "", plan: "all", signin: "all" }).rows.find((item) => item.id === userId);
  if (!row) return null;
  const person = getDb().prepare("SELECT email_verified_at, phone_verified_at, mfa_required, created_at FROM users WHERE id = ?").get(userId) as {
    email_verified_at: string;
    phone_verified_at: string;
    mfa_required: number;
    created_at: string;
  };
  const address = getEmergency(userId);
  const plan = paidPlan(userId);
  const extensions = getDb().prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ? AND status != 'removed'").get(userId) as { n: number };
  const liveTrunks = getDb().prepare("SELECT COUNT(*) AS n FROM phone_lines WHERE user_id = ? AND status = 'trunk_live' AND trunk_id > 0").get(userId) as { n: number };
  const openTrunks = getDb().prepare("SELECT COUNT(*) AS n FROM trunk_tasks WHERE user_id = ? AND status = 'open'").get(userId) as { n: number };
  const lines = getDb().prepare("SELECT did, status, trunk_id, trunk_attempts FROM phone_lines WHERE user_id = ? ORDER BY id").all(userId) as { did: string; status: string; trunk_id: number; trunk_attempts: number }[];
  const client = getDb().prepare("SELECT client_id, email, last_message, funded_cents, funded_plan FROM voip_clients WHERE user_id = ?").get(userId) as { client_id: string; email: string; last_message: string; funded_cents: number; funded_plan: string } | undefined;
  const account = getDb().prepare("SELECT account FROM voip_subaccounts WHERE user_id = ?").get(userId) as { account: string } | undefined;
  const people = getDb().prepare("SELECT number, former_number, first_name, last_name, email, status FROM pbx_extensions WHERE user_id = ? ORDER BY id").all(userId) as { number: string; former_number: string; first_name: string; last_name: string; email: string; status: string }[];
  return {
    ...row,
    emailVerified: Boolean(person.email_verified_at),
    phoneVerified: Boolean(person.phone_verified_at),
    mfaRequired: person.mfa_required === 1,
    addressLines: contactLines(address),
    addressText: address && addressReady(address) ? formatAddress(address) : "",
    allowance: plan ? extensionCapacity(plan) : 0,
    extensions: extensions.n,
    liveTrunks: liveTrunks.n,
    openTrunks: openTrunks.n,
    lines,
    client,
    lineAccount: account?.account || "",
    people,
  };
}
