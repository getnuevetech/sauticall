import { Frame } from "@/components/site/Frame";
import { PublicHome } from "@/components/site/PublicSite";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return (
    <Frame pathname="/">
      <PublicHome page={site.home} services={site.services} plans={site.plans} faqs={site.faqs} showDemo={enabled(site.flags, "marketing.ai_demo")} />
    </Frame>
  );
}
