import Link from "next/link";
import { requireAnyPermission, userCan } from "@/lib/access";
import { WEBSITE_LINKS } from "@/lib/admin-website";
import { WebsiteTable } from "@/components/admin/WebsiteTable";

const TABS = [
  { id: "pages", label: "Pages" },
  { id: "navigation", label: "Navigation" },
  { id: "brand", label: "Branding & media" },
  { id: "library", label: "Content library" },
] as const;

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAnyPermission(WEBSITE_LINKS.map((link) => link.permission));
  const params = await searchParams;
  const tab = TABS.some((item) => item.id === params.tab) ? params.tab : "pages";
  const rows = WEBSITE_LINKS.filter((link) => link.area === tab && userCan(user, link.permission));
  return (
    <>
      <h1>Website & content</h1>
      <p>Manage public pages and the elements those pages share. Saving a page updates the live site.</p>
      <div className="ap-tabs">
        {TABS.map((item) => (
          <Link key={item.id} href={item.id === "pages" ? "/admin/website" : `/admin/website?tab=${item.id}`} className={item.id === tab ? "active" : ""}>{item.label}</Link>
        ))}
      </div>
      {tab === "pages" ? <WebsiteTable rows={rows} /> : (
        <div className="ap-link-grid">
          {rows.map((row) => (
            <Link key={row.href} href={row.href} className="ap-link-card">
              <strong>{row.name}</strong>
              <span>{row.url}</span>
            </Link>
          ))}
          {rows.length === 0 ? <p>This account cannot edit this part of the site.</p> : null}
        </div>
      )}
      {tab === "pages" ? <p className="ap-note">Pricing wording is edited on the Pricing page. Plan prices and features stay in <Link href="/admin/content/plans">Catalog & billing</Link>.</p> : null}
      {tab === "navigation" ? <p className="ap-note">Header and footer apply across public pages.</p> : null}
    </>
  );
}
