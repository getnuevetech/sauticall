import { Frame } from "@/components/site/Frame";
import { HomePage } from "@/components/site/Marketing";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return (
    <Frame pathname="/">
      <HomePage page={site.home} services={site.services} plans={site.plans} personas={site.personas} showDemo={enabled(site.flags, "marketing.ai_demo")} />
    </Frame>
  );
}
