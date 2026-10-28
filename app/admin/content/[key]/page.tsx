import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DocumentEditor } from "@/components/admin/Editors";
import { PageEditor } from "@/components/admin/HomeEditor";
import { usesSectionEditor } from "@/lib/home-sections";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { requirePermission } from "@/lib/access";
import { permissionForDocument } from "@/lib/access-catalog";
import { screenFor } from "@/lib/admin-labels";
import { getDb } from "@/lib/db";
import { normalizePlans } from "@/lib/plan-features";
import type { Plan } from "@/lib/types";

export default async function ContentPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { key } = await params;
  const permission = permissionForDocument(key);
  if (!permission) redirect("/admin/denied");
  await requirePermission(permission);
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get(key) as { json: string } | undefined;
  if (!row) notFound();
  if (key === "plans") {
    const query = await searchParams;
    return (
      <>
        <span className="eyebrow">Catalog</span>
        <h2>Plans</h2>
        <p>Check the features each plan includes. Extensions included, minutes, price, and the phone-company balance are numbers. That balance is added to the VoIP.ms client only after a plan payment is confirmed, and only while funding is turned on. A customer who subscribes gets exactly the checked features, and cannot add more people than Extensions included.</p>
        {query.error ? <p className="form-feedback">{query.error}</p> : null}
        {query.saved ? <p className="form-feedback">Plans saved.</p> : null}
        <PlanEditor initial={normalizePlans(JSON.parse(row.json) as Plan[])} />
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
