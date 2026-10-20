import { Frame } from "@/components/site/Frame";
import { HowPage } from "@/components/site/Marketing";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/how-it-works"><HowPage page={site.how} home={site.home} showDemo={enabled(site.flags, "marketing.ai_demo")} /></Frame>;
}
