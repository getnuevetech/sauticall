import { Frame } from "@/components/site/Frame";
import { ContactPage } from "@/components/site/Marketing";
import { enabled, loadSite } from "@/lib/site";

export default function Page() {
  const site = loadSite();
  return <Frame pathname="/contact"><ContactPage page={site.contact} faqs={site.faqs} formEnabled={enabled(site.flags, "contact.form")} /></Frame>;
}