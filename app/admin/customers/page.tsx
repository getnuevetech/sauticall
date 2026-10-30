import Link from "next/link";
import { ApplyFilters } from "@/components/admin/ApplyFilters";
import { requirePermission } from "@/lib/access";
import { contactLines, listCustomerAccounts, type CustomerRow } from "@/lib/customer-desk";
import { getEmergency } from "@/lib/e911";

function queryOf(filters: { q: string; plan: string; signin: string; customer?: string; drawer?: string }) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.plan && filters.plan !== "all") params.set("plan", filters.plan);
  if (filters.signin && filters.signin !== "all") params.set("signin", filters.signin);
  if (filters.customer) params.set("customer", filters.customer);
  if (filters.drawer) params.set("drawer", filters.drawer);
  const text = params.toString();
  return text ? `/admin/customers?${text}` : "/admin/customers";
}

function Drawer({ row, filters }: { row: CustomerRow; filters: { q: string; plan: string; signin: string } }) {
  const lines = contactLines(getEmergency(row.id));
  return (
    <aside className="ops-drawer">
      <div className="ops-drawer-head">
        <div>
          <h2>{row.company}</h2>
          <p>Customer ID {row.code}</p>
        </div>
        <Link href={queryOf({ ...filters, drawer: "0" })} aria-label="Close">×</Link>
      </div>
      <p><Link className="btn btn-primary ops-wide" href={`/admin/customers/${row.id}`}>Open account →</Link></p>
      <dl className="ops-facts">
        <div><dt>Primary contact</dt><dd>{row.contact}</dd></div>
        <div><dt>Email</dt><dd>{row.email}</dd></div>
        <div><dt>Mobile</dt><dd>{row.phoneLabel || "Not provided"}</dd></div>
        <div><dt>Contact address</dt><dd>{lines.length ? lines.map((line) => <span key={line}>{line}<br /></span>) : "Not provided"}</dd></div>
      </dl>
      <p className="ops-banner">Customer contact numbers differ from purchased business numbers.</p>
    </aside>
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; signin?: string; customer?: string; drawer?: string }> }) {
  await requirePermission("users.customers");
  const params = await searchParams;
  const filters = {
    q: String(params.q || ""),
    plan: String(params.plan || "all"),
    signin: params.signin === "enabled" || params.signin === "disabled" ? params.signin : "all",
  };
  const { rows, plans } = listCustomerAccounts(filters);
  const requested = Number(params.customer || 0);
  const selected = params.drawer === "0" ? null : rows.find((row) => row.id === requested) || rows[0] || null;
  return (
    <div className={`ops${selected ? "" : " ops-single"}`}>
      <div>
        <p className="ops-kicker">Customers / Customer accounts</p>
        <div className="ops-head">
          <div>
            <h1>Customer accounts</h1>
            <p>Find customer profiles, services and support history.</p>
          </div>
        </div>
        <ApplyFilters action="/admin/customers">
          <input name="q" defaultValue={filters.q} placeholder="Search ID, name, email or mobile" aria-label="Search ID, name, email or mobile" />
          <select name="plan" defaultValue={filters.plan} aria-label="Plan">
            <option value="all">All plans</option>
            {plans.map((plan) => <option key={plan} value={plan === "No paid plan" ? "none" : plan}>{plan}</option>)}
          </select>
          <select name="signin" defaultValue={filters.signin} aria-label="Sign-in">
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <Link href="/admin/customers">Clear filters</Link>
        </ApplyFilters>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr><th>Customer ID</th><th>Customer</th><th>Plan</th><th>Numbers</th><th>Open tickets</th><th>Sign-in</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-current={selected?.id === row.id ? "true" : undefined}>
                  <td><Link href={`/admin/customers/${row.id}`}><strong>{row.code}</strong></Link></td>
                  <td>
                    <Link href={queryOf({ ...filters, customer: String(row.id) })}><strong>{row.company}</strong></Link>
                    <small>{row.contact}</small>
                  </td>
                  <td>{row.plan}</td>
                  <td>{row.numbers}</td>
                  <td>{row.tickets}</td>
                  <td><span className="ops-inline"><i className={row.disabled ? "ops-dot off" : "ops-dot"} /> {row.disabled ? "Disabled" : "Enabled"}</span></td>
                  <td><Link className="btn btn-secondary" href={`/admin/customers/${row.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p>No customer accounts match.</p> : null}
      </div>
      {selected ? <Drawer row={selected} filters={filters} /> : null}
    </div>
  );
}
