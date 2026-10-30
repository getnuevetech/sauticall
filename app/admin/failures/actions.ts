"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { audit, getDb } from "@/lib/db";

function back(query: string): never {
  redirect(`/admin/failures?${query}`);
}

export async function retryClientFund(formData: FormData) {
  const actor = await requirePermission("users.customers");
  const userId = Number(formData.get("user_id") || 0);
  const paid = getDb().prepare("SELECT plan_name FROM payment_attempts WHERE user_id = ? AND status = 'paid' AND product_kind != 'bundle' AND plan_name != '' ORDER BY id DESC LIMIT 1").get(userId) as { plan_name: string } | undefined;
  if (!paid) back(`area=client&error=${encodeURIComponent("This customer has no confirmed plan payment. An administrator has to fix this.")}`);
  const { fundPaidPlanWithRetry } = await import("@/lib/voip-client");
  const result = await fundPaidPlanWithRetry(userId, paid.plan_name);
  audit(actor.email, "voip.fund.retry", `${userId}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) back(`area=client&error=${encodeURIComponent(result.message)}`);
  back("area=client&saved=1");
}
