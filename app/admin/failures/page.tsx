import Link from "next/link";
import { retryClientFund } from "./actions";
import { ApplyFilters } from "@/components/admin/ApplyFilters";
import { CopyButton } from "@/components/admin/CopyButton";
import { requireAnyPermission } from "@/lib/access";
import { ensureCustomerCode } from "@/lib/customer-code-store";
import { getDb } from "@/lib/db";
import { FAILURE_OPERATIONS, FAILURE_PROVIDERS, ago, failureFacts, groupFailures, operationLabel, providerFor, withinDays, workflowHref, workflowLabel, type FailureAttempt } from "@/lib/failure-desk";
import { formatWhen } from "@/lib/format-when";

type Raw = FailureAttempt & { email: string | null; name: string | null; customer_code: string | null };

function listHref(filters: { q: string; operation: string; provider: string; days: string; failure?: string; drawer?: string }) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.operation) params.set("operation", filters.operation);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.days && filters.days !== "30") params.set("days", filters.days);
  if (filters.failure) params.set("failure", filters.failure);
  if (filters.drawer) params.set("drawer", filters.drawer);
  const text = params.toString();
  return text ? `/admin/failures?${text}` : "/admin/failures";
}

export default async function FailuresPage({ searchParams }: { searchParams: Promise<{ q?: string; operation?: string; provider?: string; days?: string; failure?: string; drawer?: string; saved?: string; error?: string }> }) {
  await requireAnyPermission(["inbox.requests", "settings.phone", "settings.lines", "settings.payments"]);
  const params = await searchParams;
  const operation = FAILURE_OPERATIONS.some((item) => item.value === params.operation) ? params.operation || "" : "";
  const provider = FAILURE_PROVIDERS.some((item) => item.value === params.provider) ? params.provider || "" : "";
  const days = params.days === "7" || params.days === "90" || params.days === "0" ? params.days : "30";
  const q = String(params.q || "").trim().toLowerCase();
  const rows = getDb().prepare(
    `SELECT f.id, f.area, f.user_id AS userId, f.subject, f.detail, f.created_at AS createdAt, u.email, u.name, u.customer_code
     FROM failure_log f LEFT JOIN users u ON u.id = f.user_id
     ORDER BY f.id DESC LIMIT 400`,
  ).all() as Raw[];
  const now = Date.now();
  const grouped = groupFailures(rows).filter((group) => {
    if (operation && group.area !== operation) return false;
    if (provider && providerFor(group.area) !== provider) return false;
    if (!withinDays(group.latest.createdAt, Number(days), now)) return false;
    if (!q) return true;
    const person = rows.find((row) => row.id === group.latest.id);
    const hay = `${person?.customer_code || ""} ${person?.name || ""} ${person?.email || ""} ${group.subject} ${group.latest.detail}`.toLowerCase();
    return hay.includes(q);
  });
  const requested = Number(params.failure || 0);
  const selected = params.drawer === "0" ? null : grouped.find((group) => group.attempts.some((item) => item.id === requested)) || grouped[0] || null;
  const person = selected ? rows.find((row) => row.userId === selected.userId && row.userId) : undefined;
  const code = person?.userId ? (person.customer_code || ensureCustomerCode(person.userId)) : "";
  const facts = selected ? failureFacts(selected.latest.detail) : null;
  const filters = { q: String(params.q || ""), operation, provider, days };
  return (
    <div className={`ops${selected ? "" : " ops-single"}`}>
      <div>
        <p className="ops-kicker">Customers / Failed requests</p>
        <div className="ops-head">
          <div>
            <h1>Failed requests</h1>
            <p>Investigate failed operations and open the affected workflow.</p>
          </div>
        </div>
        {params.saved ? <p className="form-feedback">Retry successful. The plan balance was added.</p> : null}
        {params.error ? <p className="ops-alert">{params.error}</p> : null}
        <ApplyFilters action="/admin/failures">
          <input name="q" defaultValue={filters.q} placeholder="Search customer ID, number or error" aria-label="Search customer ID, number or error" />
          <select name="operation" defaultValue={operation} aria-label="Operation">
            {FAILURE_OPERATIONS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
          </select>
          <select name="provider" defaultValue={provider} aria-label="Provider">
            {FAILURE_PROVIDERS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
          </select>
          <select name="days" defaultValue={days} aria-label="Date">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="0">Any date</option>
          </select>
          <Link href="/admin/failures">Clear filters</Link>
        </ApplyFilters>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr><th>Customer</th><th>Operation</th><th>Latest error</th><th>Attempts</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const owner = rows.find((row) => row.id === group.latest.id);
                const short = failureFacts(group.latest.detail).cause;
                return (
                  <tr key={group.key} data-current={selected?.key === group.key ? "true" : undefined}>
                    <td>
                      <Link href={listHref({ ...filters, failure: String(group.latest.id) })}><strong>{owner?.name || "No customer"}</strong></Link>
                      <small>{owner?.customer_code || owner?.email || ""}</small>
                    </td>
                    <td>{operationLabel(group.area)}</td>
                    <td>{short}</td>
                    <td>{group.attempts.length}</td>
                    <td>{ago(group.latest.createdAt, now)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {grouped.length === 0 ? <p>No failed requests in this list.</p> : null}
        <p className="ops-muted">Number-related failures also appear in Number requests. A plan balance can be tried again from the detail.</p>
      </div>
      {selected && facts ? (
        <aside className="ops-drawer">
          <div className="ops-drawer-head">
            <div>
              <h2>{operationLabel(selected.area)} failed</h2>
            </div>
            <Link href={listHref({ ...filters, drawer: "0" })} aria-label="Close">×</Link>
          </div>
          <dl className="ops-facts">
            <div><dt>Customer</dt><dd>{person?.userId ? <Link href={`/admin/customers/${person.userId}`}>{person.name || person.email} ({code})</Link> : "No customer"}</dd></div>
            <div><dt>Target</dt><dd>{selected.subject || "Not recorded"}</dd></div>
            <div><dt>Provider</dt><dd>{providerFor(selected.area)}</dd></div>
            <div><dt>HTTP status</dt><dd>{facts.status || "Not in the reply"}</dd></div>
            <div><dt>Error code</dt><dd>{facts.code ? <span className="ops-badge bad">{facts.code}</span> : "Not in the reply"}</dd></div>
            <div><dt>Cause</dt><dd>{facts.cause}</dd></div>
          </dl>
          <details className="ops-details" open>
            <summary>Attempt history ({selected.attempts.length})</summary>
            <table className="ops-table">
              <thead><tr><th>#</th><th>Date & time</th><th>Result</th><th>Error</th></tr></thead>
              <tbody>
                {[...selected.attempts].reverse().map((attempt, index) => (
                  <tr key={attempt.id}>
                    <td>{selected.attempts.length - index}</td>
                    <td>{formatWhen(attempt.createdAt)}</td>
                    <td>Failed</td>
                    <td>{failureFacts(attempt.detail).cause}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details className="ops-details" open>
            <summary>Technical response</summary>
            <div className="acct-code">{selected.latest.detail}<CopyButton value={selected.latest.detail} label="Copy technical response" /></div>
          </details>
          <div className="fail-actions">
            <Link className="btn btn-primary" href={workflowHref(selected.area, selected.userId)}>{workflowLabel(selected.area)}</Link>
            {person?.userId ? <Link className="btn btn-secondary" href={`/admin/customers/${person.userId}`}>Open customer</Link> : null}
          </div>
          <p className="ops-muted">Retry in the owning workflow after checking the current provider state.</p>
          {selected.area === "client" && selected.userId && !selected.latest.detail.startsWith("Retry successful.") ? (
            <form action={retryClientFund}>
              <input type="hidden" name="user_id" value={selected.userId} />
              <input type="hidden" name="failure" value={selected.latest.id} />
              <button className="btn btn-secondary" type="submit">Try the fund again</button>
            </form>
          ) : null}
          {person?.userId ? <p><Link href={listHref({ ...filters, q: code || person.email || "" })}>View customer failures →</Link></p> : null}
        </aside>
      ) : null}
    </div>
  );
}
