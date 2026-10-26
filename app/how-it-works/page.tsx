import { Frame } from "@/components/site/Frame";
import { PublicHow } from "@/components/site/PublicSite";
import { enabled, loadSite } from "@/lib/site";

export default async function Page({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const params = await searchParams;
  const site = loadSite();
  return <Frame pathname="/how-it-works"><PublicHow home={site.home} plans={site.plans} showDemo={enabled(site.flags, "marketing.ai_demo")} prompt={String(params.prompt || "").slice(0, 400)} /></Frame>;
}
