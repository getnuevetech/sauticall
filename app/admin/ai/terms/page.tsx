import { AiSectionNav } from "@/components/admin/AiSectionNav";
import { requirePermission } from "@/lib/access";
import { AI_SWITCHES } from "@/lib/ai-system";
import { currentAgreement } from "@/lib/ai-store";
import { saveAgreementForm } from "../actions";

const SERVICES = AI_SWITCHES.filter((item) => item.code !== "master");

export default async function AiTermsPage({ searchParams }: { searchParams: Promise<{ feature?: string; saved?: string; error?: string }> }) {
  await requirePermission("settings.ai");
  const query = await searchParams;
  const feature = SERVICES.some((item) => item.code === query.feature) ? query.feature || "notifications" : "notifications";
  const agreement = currentAgreement(feature);
  const selected = SERVICES.find((item) => item.code === feature);
  return (
    <div className="ops ops-single">
      <div>
        <p className="ops-kicker">AI System / Agreements</p>
        <h1>Agreements</h1>
        <AiSectionNav current="terms" />
        <p>Each save with different text publishes a new version. Customers who already accepted an older version must accept again. This text needs legal review before production calling.</p>
        {query.saved ? <p className="form-feedback">Agreement version {query.saved} is the one customers see.</p> : null}
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        <div className="ops-tabs">
          {SERVICES.map((item) => <a key={item.code} href={`/admin/ai/terms?feature=${item.code}`} data-current={item.code === feature ? "true" : undefined}>{item.label}</a>)}
        </div>
        <form action={saveAgreementForm} className="ops-card ops-stack">
          <input type="hidden" name="feature" value={feature} />
          <h2>{selected?.label}</h2>
          {agreement ? <p>Current version {agreement.version}.</p> : <p>No version is published yet.</p>}
          <label>Title <input name="title" defaultValue={agreement?.title || ""} required /></label>
          <label>Agreement <textarea name="body" rows={12} defaultValue={agreement?.body || ""} required /></label>
          <button className="btn btn-primary" type="submit">Publish agreement</button>
        </form>
      </div>
    </div>
  );
}
