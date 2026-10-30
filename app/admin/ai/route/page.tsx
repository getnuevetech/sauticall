import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { customerRoute, listRouteCustomers, savedRoutes } from "@/lib/ai-route-store";
import { saveRouteForm } from "./actions";

function checkedLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  return `${clock} CT`;
}

export default async function AiRouteAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const q = String(query.q || "");
  const customers = listRouteCustomers(q);
  const saved = new Map(savedRoutes().map((row) => [row.user_id, row]));
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Outbound</p>
        <h1>Outbound</h1>
        <AiSectionNav current="route" />
        <p>Primary outbound uses the customer&apos;s own 3CX extension and trunk, and the caller ID has to be that customer&apos;s number. The VoIP.ms backup has to be that customer&apos;s client account. Saving a check reads the numbers already stored here. It does not call 3CX or VoIP.ms, and the line stays idle.</p>
        {query.saved ? <p className="form-feedback">Route check saved. The line stays idle.</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <form className="ops-toolbar" action="/admin/ai/route">
          <input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search customers" />
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Customer</th><th>Extension</th><th>Trunk</th><th>Caller ID</th><th>Backup</th><th></th></tr></thead>
            <tbody>
              {customers.map((customer) => {
                const route = customerRoute(customer.id);
                const extension = route.lines.find((line) => line.name === "extension");
                const trunk = route.lines.find((line) => line.name === "trunk");
                const caller = route.lines.find((line) => line.name === "caller_id");
                const backup = route.lines.find((line) => line.name === "backup");
                const prior = saved.get(customer.id);
                return (
                  <tr key={customer.id}>
                    <td><strong>{customer.name}</strong><small>{customer.email}</small>{prior ? <small>Saved {checkedLabel(prior.checked_at)}</small> : null}</td>
                    <td>{extension?.text}</td>
                    <td>{trunk?.text}</td>
                    <td>{caller?.text}</td>
                    <td>{backup?.text}</td>
                    <td>
                      <form action={saveRouteForm}>
                        <input type="hidden" name="user_id" value={customer.id} />
                        <button className="btn btn-secondary" type="submit">Save check</button>
                        <small>Idle. No call.</small>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {customers.length === 0 ? <p>No customers match.</p> : null}
      </div>
    </div>
  );
}
