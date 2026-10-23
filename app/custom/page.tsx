import { Frame } from "@/components/site/Frame";
import { CustomPlanPage } from "@/components/site/Marketing";
import { enabled, loadSite } from "@/lib/site";

export default async function Page({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const site = loadSite();
  const params = await searchParams;
  return (
    <Frame pathname="/custom">
      <CustomPlanPage page={site.custom} formEnabled={enabled(site.flags, "sales.custom_request")} setup={params.setup || ""} />
    </Frame>
  );
}
