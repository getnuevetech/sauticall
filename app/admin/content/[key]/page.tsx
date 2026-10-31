import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BundleStudio } from "@/components/admin/BundleStudio";
import { DocumentEditor } from "@/components/admin/Editors";
import { PageEditor } from "@/components/admin/HomeEditor";
import { usesSectionEditor } from "@/lib/home-sections";
import { requirePermission } from "@/lib/access";
import { permissionForDocument } from "@/lib/access-catalog";
import { screenFor } from "@/lib/admin-labels";
import { bundlePurchaseCounts, checkoutCurrency } from "@/lib/catalog-store";
import { catalogMoney, normalizeBundle } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { normalizePlans, PLAN_FEATURES } from "@/lib/plan-features";
import type { Plan } from "@/lib/types";

export default async function ContentPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ error?: string; saved?: string; q?: string; plan?: string; compare?: string }> }) {
  const { key } = await params;
  const permission = permissionForDocument(key);
  if (!permission) redirect("/admin/denied");
  await requirePermission(permission);
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get(key) as { json: string } | undefined;
  if (!row) notFound();
  if (key === "plans") {
    const query = await searchParams;
    const plans = normalizePlans(JSON.parse(row.json) as Plan[]);
    const needle = (query.q || "").trim().toLowerCase();
    const visible = plans.filter((plan) => !needle || `${plan.name} ${plan.desc}`.toLowerCase().includes(needle));
    const selected = visible.find((plan) => plan.name === query.plan) || visible.find((plan) => plan.popular) || visible[0];
    const money = checkoutCurrency();
    const keep = new URLSearchParams();
    if (query.q) keep.set("q", query.q);
    const withPlan = (name: string) => {
      const next = new URLSearchParams(keep);
      next.set("plan", name);
      if (query.compare === "1") next.set("compare", "1");
      return `/admin/content/plans?${next}`;
    };
    return (
      <div className={`ops${selected ? "" : " ops-single"}`}>
        <div>
          <p className="ops-kicker">Catalog & billing / Plans</p>
          <div className="ops-head">
            <div>
              <h1>Plans</h1>
              <p>Manage subscription pricing, allowances and included features.</p>
            </div>
            <div className="ops-inline">
              <Link className="btn btn-primary" href="/admin/content/plans/edit?new=1">+ Add plan</Link>
              <Link className="btn btn-secondary" href={query.compare === "1" ? `/admin/content/plans?${keep}` : `/admin/content/plans?${new URLSearchParams({ ...Object.fromEntries(keep), compare: "1" })}`}>Compare features</Link>
            </div>
          </div>
          {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
          {query.saved ? <p className="form-feedback">Plans saved. Existing purchase records were not rewritten.</p> : null}
          <form className="ops-toolbar" method="get">
            {query.compare === "1" ? <input type="hidden" name="compare" value="1" /> : null}
            <input name="q" defaultValue={query.q || ""} placeholder="Search plans" aria-label="Search plans" />
            <button className="btn btn-secondary" type="submit">Search</button>
          </form>
          {visible.length === 0 ? (
            <section className="ops-empty">
              <h2>{plans.length === 0 ? "No plans yet" : "No matching plans"}</h2>
              <p>{plans.length === 0 ? "Add a plan to set its price, extensions, and minutes." : "No plans match this search."}</p>
            </section>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Plan</th><th>Monthly price</th><th>Extensions</th><th>Outbound minutes</th><th>Action</th></tr></thead>
                <tbody>
                  {visible.map((plan) => (
                    <tr key={plan.name} data-current={selected?.name === plan.name ? "true" : undefined}>
                      <td><Link href={withPlan(plan.name)}><strong>{plan.name}</strong></Link>{plan.popular ? <span className="ops-badge info">Popular</span> : null}</td>
                      <td>{plan.custom ? "Custom" : catalogMoney(plan.price, money.code)}</td>
                      <td>{plan.seats ?? 0}</td>
                      <td>{plan.includedMinutes.toLocaleString("en-US")}</td>
                      <td><Link className={`btn ${selected?.name === plan.name ? "btn-primary" : "btn-secondary"}`} href={`/admin/content/plans/edit?name=${encodeURIComponent(plan.name)}`}>Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {query.compare === "1" && visible.length > 0 ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Feature</th>{visible.map((plan) => <th key={plan.name}>{plan.name}</th>)}</tr></thead>
                <tbody>
                  {PLAN_FEATURES.map((feature) => (
                    <tr key={feature.key}>
                      <td>{feature.label}</td>
                      {visible.map((plan) => <td key={plan.name}>{plan.features.includes(feature.key) ? "Included" : "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="ops-banner">Catalog edits may affect customer entitlements. Review how a change affects existing subscribers before saving it in the plan editor.</p>
        </div>
        {selected ? (
          <aside className="ops-drawer">
            <h2>Selected plan</h2>
            <p className="ops-kicker">{selected.name}</p>
            <p className="ops-price">{selected.custom ? "Custom" : catalogMoney(selected.price, money.code)} <small>per month</small></p>
            <dl className="ops-facts">
              <div><dt>Extensions</dt><dd>{selected.seats ?? 0}</dd></div>
              <div><dt>Outbound minutes</dt><dd>{selected.includedMinutes.toLocaleString("en-US")}</dd></div>
            </dl>
            <h3>Public presentation</h3>
            <dl className="ops-facts">
              <div><dt>Popular plan</dt><dd>{selected.popular ? "On" : "Off"}</dd></div>
              <div><dt>Custom quote</dt><dd>{selected.custom ? "On" : "Off"}</dd></div>
            </dl>
            <h3>Provider funding</h3>
            <dl className="ops-facts">
              <div><dt>Amount</dt><dd>{catalogMoney(selected.carrierCredit || 0, money.code)}</dd></div>
              <div><dt>Currency</dt><dd>{money.code}</dd></div>
            </dl>
            <p className="ops-muted">{money.choices.length > 1 ? `Enabled gateways charge ${money.choices.join(", ")}. The stored amount is not sent from this page.` : "This amount is stored on the plan. It is sent to the phone company only after a plan payment is confirmed, and only while funding is on."}</p>
            <Link className="btn btn-secondary" href={`/admin/content/plans/edit?name=${encodeURIComponent(selected.name)}`}>Edit plan</Link>
          </aside>
        ) : null}
      </div>
    );
  }
  if (key === "minute_bundles") {
    const query = await searchParams;
    const parsed = JSON.parse(row.json) as unknown;
    const bundles = (Array.isArray(parsed) ? parsed : []).map((item) => normalizeBundle(item as { name?: string; minutes?: number; price?: number; enabled?: boolean }));
    const money = checkoutCurrency();
    return (
      <>
        <p className="ops-kicker">Catalog & billing / Minute bundles</p>
        {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
        {query.saved ? <p className="form-feedback">Bundles saved. Customer balances were not changed.</p> : null}
        <BundleStudio initial={bundles} purchases={bundlePurchaseCounts()} currency={money.code} currencyChoices={money.choices} />
      </>
    );
  }
  if (usesSectionEditor(key)) {
    const screen = screenFor(key);
    return (
      <>
        <h1>{screen.title}</h1>
        <p>{screen.intro} The preview shows the unsaved top of the page. The public page changes when you save.</p>
        <PageEditor docKey={key} initial={JSON.parse(row.json) as Record<string, unknown>} />
      </>
    );
  }
  const screen = screenFor(key);
  const catalog = key === "minute_bundles";
  return (
    <>
      <span className="eyebrow">{catalog ? "Catalog" : "Website wording"}</span>
      <h2>{screen.title}</h2>
      <p>{screen.intro}</p>
      {catalog ? null : <p>Saving updates the live site. Header and footer are shared from <Link href="/admin/website?tab=navigation">Website & content</Link>. Plan prices stay in <Link href="/admin/content/plans">Catalog & billing</Link>.</p>}
      <DocumentEditor docKey={key} initial={JSON.parse(row.json)} />
    </>
  );
}
