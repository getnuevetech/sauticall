import type { Metadata } from "next";
import { Frame } from "@/components/site/Frame";
import { PublicAi } from "@/components/site/PublicSite";
import { loadSite, pageMetadata } from "@/lib/site";

export function generateMetadata(): Metadata {
  return pageMetadata(loadSite().ai);
}

export default function Page() {
  const site = loadSite();
    return <Frame pathname="/ai-receptionist"><PublicAi page={site.ai} plans={site.plans} faqs={site.faqs} /></Frame>;
}
