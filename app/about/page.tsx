import type { Metadata } from "next";
import { Frame } from "@/components/site/Frame";
import { AboutPage } from "@/components/site/Marketing";
import { loadSite, pageMetadata } from "@/lib/site";

export function generateMetadata(): Metadata {
  return pageMetadata(loadSite().about);
}

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/about"><AboutPage page={site.about} /></Frame>;
}
