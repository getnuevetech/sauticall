import { Frame } from "@/components/site/Frame";
import { PublicSolutions } from "@/components/site/PublicSite";
import { loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/solutions"><PublicSolutions page={site.solutions} services={site.services} /></Frame>;
}
