import type { Metadata } from "next";
import { Frame } from "@/components/site/Frame";
import { ContactPage } from "@/components/site/Marketing";
import { enabled, loadSite, pageMetadata } from "@/lib/site";

export function generateMetadata(): Metadata {
  return pageMetadata(loadSite().contact);
}

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/contact"><ContactPage page={site.contact} faqs={site.faqs} formEnabled={enabled(site.flags, "contact.form")} /></Frame>;
}