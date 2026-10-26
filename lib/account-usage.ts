import { getDb } from "./db";
import { minuteBalance } from "./minutes";
import { paidPlan } from "./pbx";

type Grant = { minutes: number; period_start: string; period_end: string };
type Payment = { id: number; amount_cents: number; currency: string; description: string; plan_name: string; product_kind: string; paid_at: string; created_at: string; public_label: string };

export function accountUsage(userId: number) {
  const plan = paidPlan(userId);
  const balance = minuteBalance(userId);
  const grant = getDb().prepare("SELECT minutes, period_start, period_end FROM minute_grants WHERE user_id = ? AND kind = 'plan' ORDER BY period_end DESC LIMIT 1").get(userId) as Grant | undefined;
  const usedRow = grant
    ? getDb().prepare("SELECT COALESCE(SUM(d.seconds), 0) AS seconds FROM minute_debits d JOIN minute_grants g ON g.id = d.grant_id WHERE d.user_id = ? AND g.kind = 'plan' AND g.period_end = ?").get(userId, grant.period_end) as { seconds: number }
    : { seconds: 0 };
  const included = grant?.minutes || plan?.includedMinutes || 0;
  const usedMinutes = Math.floor((Number(usedRow.seconds) || 0) / 60);
  const payments = getDb().prepare(
    `SELECT a.id, a.amount_cents, a.currency, a.description, a.plan_name, a.product_kind, a.paid_at, a.created_at, COALESCE(g.public_label, '') AS public_label
     FROM payment_attempts a LEFT JOIN gateways g ON g.id = a.gateway_id
     WHERE a.user_id = ? AND a.status = 'paid' ORDER BY a.id DESC`,
  ).all(userId) as Payment[];
  const planPayment = payments.find((payment) => payment.product_kind !== "bundle" && payment.plan_name);
  const periodStart = grant?.period_start || planPayment?.paid_at || planPayment?.created_at || "";
  const extraCents = payments
    .filter((payment) => payment.product_kind === "bundle" && (!periodStart || (payment.paid_at || payment.created_at) >= periodStart))
    .reduce((sum, payment) => sum + payment.amount_cents, 0);
  return {
    plan,
    balance,
    grant,
    included,
    usedMinutes,
    remaining: Math.max(0, included - usedMinutes),
    payments,
    planPayment,
    periodStart,
    periodEnd: grant?.period_end || "",
    extraCents,
    renewalAmount: plan ? plan.price : 0,
  };
}
