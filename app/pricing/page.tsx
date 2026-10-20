import { Frame } from "@/components/site/Frame";
import { PricingPage } from "@/components/site/Marketing";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return (
    <Frame pathname="/pricing">
      <PricingPage page={site.pricing} plans={site.plans} faqs={site.faqs} showEstimator={enabled(site.flags, "marketing.estimator")} />
    </Frame>
  );
}
