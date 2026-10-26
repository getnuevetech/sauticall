import { Frame } from "@/components/site/Frame";
import { PublicAi } from "@/components/site/PublicSite";
import { loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
    return <Frame pathname="/ai-receptionist"><PublicAi page={site.ai} plans={site.plans} faqs={site.faqs} /></Frame>;
}
