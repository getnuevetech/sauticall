import { Frame } from "@/components/site/Frame";
import { PublicHow } from "@/components/site/PublicSite";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/how-it-works"><PublicHow home={site.home} plans={site.plans} showDemo={enabled(site.flags, "marketing.ai_demo")} /></Frame>;
}
