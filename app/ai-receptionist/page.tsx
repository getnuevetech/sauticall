import { Frame } from "@/components/site/Frame";
import { AiPage } from "@/components/site/Marketing";
import { loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/ai-receptionist"><AiPage page={site.ai} home={site.home} /></Frame>;
}
