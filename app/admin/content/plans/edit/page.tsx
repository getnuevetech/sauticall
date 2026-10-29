import { notFound } from "next/navigation";
import { PlanStudio } from "@/components/admin/PlanStudio";
import { requirePermission } from "@/lib/access";
import { checkoutCurrency, latestPaidPlanCounts } from "@/lib/catalog-store";
import { flagOn, readDoc } from "@/lib/db";
import { normalizePlans } from "@/lib/plan-features";
import type { Plan } from "@/lib/types";

export default async function EditPlanPage({ searchParams }: { searchParams: Promise<{ name?: string; new?: string }> }) {
  await requirePermission("content.plans");
  const query = await searchParams;
  const plans = normalizePlans(readDoc<Plan[]>("plans"));
  const creating = query.new === "1" && !query.name;
  const initial = creating ? null : plans.find((plan) => plan.name === query.name);
  if (!creating && !initial) notFound();
  const money = checkoutCurrency();
  const subscribers = initial ? latestPaidPlanCounts().get(initial.name) || 0 : 0;
  return (
    <PlanStudio
      plans={plans}
      initial={initial || null}
      creating={creating}
      subscribers={subscribers}
      currency={money.code}
      currencyChoices={money.choices}
      fundEnabled={flagOn("billing.fund_client")}
    />
  );
}
