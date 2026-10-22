import { Frame } from "@/components/site/Frame";
import { CustomPlanPage } from "@/components/site/Marketing";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return (
    <Frame pathname="/custom">
      <CustomPlanPage page={site.custom} formEnabled={enabled(site.flags, "sales.custom_request")} />
    </Frame>
  );
}
