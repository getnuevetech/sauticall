import type { Metadata } from "next";
import { Frame } from "@/components/site/Frame";
import { PublicSolutions } from "@/components/site/PublicSite";
import { loadSite, pageMetadata } from "@/lib/site";

export function generateMetadata(): Metadata {
  return pageMetadata(loadSite().solutions);
}

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/solutions"><PublicSolutions page={site.solutions} services={site.services} /></Frame>;
}
