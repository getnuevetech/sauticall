import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { finishAfterResponse } from "@/lib/later";
import { alignStoredExtensions } from "@/lib/pbx";
import { listCompanies, setupLabel } from "@/lib/phone-ops";

export default async function AdminPhonePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; company?: string; error?: string }> }) {
  await requirePermission("settings.phone");
  finishAfterResponse(() => alignStoredExtensions());
  const params = await searchParams;
  const rows = listCompanies(params.q || "", params.status || "");
  const selected = rows.find((row) => row.id === Number(params.company)) || rows[0];
  return (
    <div className="ops">
      <div>
        <div className="ops-head">
          <div>
            <p className="ops-kicker">Company overview</p>
            <h1>Extensions & groups</h1>
            <p>Manage each company’s people, groups and call routing.</p>
          </div>
          <Link className="btn btn-secondary" href="/admin/phone/numbering">Global numbering settings</Link>
        </div>
        {params.error ? <p className="form-feedback">{params.error}</p> : null}
        <form className="ops-toolbar" method="get">
          <input name="q" defaultValue={params.q || ""} placeholder="Search company or account" aria-label="Search company or account" />
          <select name="status" defaultValue={params.status || "all"} aria-label="Setup status">
            <option value="all">All statuses</option>
            <option value="attention">Needs attention</option>
            <option value="pending">Pending</option>
            <option value="provisioned">Provisioned</option>
            <option value="empty">No records</option>
          </select>
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr><th>Company</th><th>Department</th><th>Extensions</th><th>Setup</th><th></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={5}>No companies match this search.</td></tr> : null}
              {rows.map((row) => (
                <tr key={row.id} data-current={selected?.id === row.id ? "true" : undefined}>
                  <td><Link href={`/admin/phone?company=${row.id}&q=${encodeURIComponent(params.q || "")}&status=${params.status || "all"}`}><strong>{row.name}</strong><small>{row.email}</small></Link></td>
                  <td>{row.department}</td>
                  <td>{row.records} of {row.allowance || "—"}</td>
                  <td><span className={`ops-badge ${row.status}`}>{setupLabel(row.status)}</span></td>
                  <td><Link className="btn btn-secondary" href={`/admin/phone/${row.id}`}>Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-foot">Extension allowance follows each company’s plan. <Link href="/admin/content/plans">Manage plan entitlements.</Link></p>
      </div>
      {selected ? (
        <aside className="ops-drawer">
          <div className="ops-drawer-head">
            <h2>{selected.name}</h2>
            <Link href="/admin/phone" aria-label="Close">×</Link>
          </div>
          <dl className="ops-facts">
            <div><dt>Account</dt><dd>{selected.email}</dd></div>
            <div><dt>Department</dt><dd>{selected.department}</dd></div>
            <div><dt>Reserved extensions</dt><dd>{selected.from && selected.to ? `${selected.from} – ${selected.to}` : "Not reserved"}</dd></div>
            <div><dt>Plan allowance</dt><dd>{selected.allowance || "No paid plan"}</dd></div>
            <div><dt>Records</dt><dd>{selected.records}</dd></div>
            <div><dt>On phone system</dt><dd>{selected.live}</dd></div>
            <div><dt>Needs attention</dt><dd>{selected.failed}</dd></div>
          </dl>
          {selected.departmentMessage ? <p>{selected.departmentMessage}</p> : null}
          <Link className="btn btn-primary ops-wide" href={`/admin/phone/${selected.id}`}>Open company workspace</Link>
          <h3>Routing summary</h3>
          <div className="ops-route">
            <strong>Daytime</strong>
            <span>{selected.ring || "First extension, until a group is saved"}</span>
            <small>{selected.ringState || "Phone-system verification pending."}</small>
          </div>
          <div className="ops-route">
            <strong>After hours</strong>
            <span>Voicemail</span>
            <small>Saved configuration. Not verified live.</small>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
