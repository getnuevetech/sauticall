import { Frame } from "@/components/site/Frame";
import { SolutionsPage } from "@/components/site/Marketing";
import { loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/solutions"><SolutionsPage page={site.solutions} services={site.services} /></Frame>;
}
