import { Frame } from "@/components/site/Frame";
import { AboutPage } from "@/components/site/Marketing";
import { loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/about"><AboutPage page={site.about} /></Frame>;
}
