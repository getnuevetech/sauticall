import type { Metadata } from "next";
import { Frame } from "@/components/site/Frame";
import { PublicPricing } from "@/components/site/PublicSite";
import { readDoc } from "@/lib/db";
import { loadSite, pageMetadata } from "@/lib/site";

export function generateMetadata(): Metadata {
  return pageMetadata(loadSite().pricing);
}

export default function Page() {
  const site = loadSite();
  const bundles = readDoc<{ name?: string; minutes?: number; price?: number; enabled?: boolean }[]>("minute_bundles")
    .filter((bundle) => bundle.enabled !== false && Number(bundle.minutes) > 0)
    .map((bundle) => ({ name: String(bundle.name || ""), minutes: Number(bundle.minutes), price: Number(bundle.price) }));
  return (
    <Frame pathname="/pricing">
      <PublicPricing page={site.pricing} plans={site.plans} faqs={site.faqs} bundles={bundles} />
    </Frame>
  );
}
