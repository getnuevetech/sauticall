import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { activationState } from "@/lib/ai-system";
import { acceptedVersion, currentAgreement, entitlementFor, enabledSwitchCodes } from "@/lib/ai-store";
import { featureReady } from "@/lib/ai-system";
import { getDb } from "@/lib/db";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { reviewCustomerAi } from "../actions";

export default async function AiAccessPage({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const q = String(query.q || "").trim().slice(0, 80);
  const customers = getDb().prepare(
    "SELECT id, name, email FROM users WHERE role = 'customer' AND (? = '' OR email LIKE ? OR name LIKE ?) ORDER BY id DESC LIMIT 40",
  ).all(q, `%${q}%`, `%${q}%`) as { id: number; name: string; email: string }[];
  const enabled = enabledSwitchCodes();
  const agreement = currentAgreement("notifications");
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Customer access</p>
        <h1>Customer access</h1>
        <AiSectionNav current="access" />
        <p>Grant or suspend Automated notifications. A grant does not place a call, and it does not replace permission from each recipient.</p>
        {query.saved ? <p className="form-feedback">Access updated.</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <form className="ops-toolbar" action="/admin/ai/access">
          <input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search customers" />
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Customer</th><th>Plan</th><th>Notifications</th><th>Review</th></tr></thead>
            <tbody>
              {customers.map((customer) => {
                const plan = paidPlan(customer.id);
                const ent = entitlementFor(customer.id, "notifications");
                const state = activationState({
                  globalOn: featureReady(enabled, "notifications"),
                  planIncludes: planAllows(plan, "ai_notifications"),
                  publishedVersion: agreement?.version || 0,
                  acceptedVersion: acceptedVersion(customer.id, "notifications"),
                  grant: ent.grant,
                  customerEnabled: ent.customerEnabled,
                  reviewRequired: true,
                });
                return (
                  <tr key={customer.id}>
                    <td><strong>{customer.name}</strong><small>{customer.email}</small></td>
                    <td>{plan?.name || "No paid plan"}</td>
                    <td><span className={`ops-badge ${state.code === "active" ? "ok" : state.code === "suspended" ? "warn" : "muted"}`}>{state.label}</span></td>
                    <td>
                      <form action={reviewCustomerAi} className="ops-inline">
                        <input type="hidden" name="user_id" value={customer.id} />
                        <button className="btn btn-secondary" name="decision" value="granted" type="submit">Grant</button>
                        <button className="btn btn-secondary" name="decision" value="suspended" type="submit">Suspend</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
