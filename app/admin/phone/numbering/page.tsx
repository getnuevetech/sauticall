import Link from "next/link";
import { ExtensionPlanForm } from "@/components/admin/ExtensionPlanForm";
import { requirePermission } from "@/lib/access";
import { readExtensionPlan } from "@/lib/extension-plan";
import { extensionCapacity, normalizePlans } from "@/lib/plan-features";
import { readDoc } from "@/lib/db";
import type { Plan } from "@/lib/types";

export default async function NumberingPage() {
  await requirePermission("settings.phone");
  const plan = readExtensionPlan();
  const plans = normalizePlans(readDoc<Plan[]>("plans")).filter((item) => !item.custom);
  return (
    <div className="ops ops-single">
      <div className="ops-head">
        <div>
          <p className="ops-kicker">Separate from each company</p>
          <h1>Global numbering settings</h1>
          <p>These starting numbers apply to every company. A person’s existing extension is kept. Plan allowances stay on each plan: {plans.map((item) => `${item.name} includes ${extensionCapacity(item)}`).join(", ") || "no plans are saved"}.</p>
        </div>
        <Link className="btn btn-secondary" href="/admin/phone">Back to companies</Link>
      </div>
      <ExtensionPlanForm plan={plan} />
    </div>
  );
}
