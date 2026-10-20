import Link from "next/link";

const LINKS = [
  ["Overview", "/admin"],
  ["Home copy", "/admin/content/page.home"],
  ["Solutions", "/admin/content/page.solutions"],
  ["AI page", "/admin/content/page.ai"],
  ["How it works", "/admin/content/page.how"],
  ["Pricing copy", "/admin/content/page.pricing"],
  ["About", "/admin/content/page.about"],
  ["Contact", "/admin/content/page.contact"],
  ["Account copy", "/admin/content/page.account"],
  ["Navigation", "/admin/content/nav"],
  ["Footer", "/admin/content/footer"],
  ["Services", "/admin/content/services"],
  ["Plans", "/admin/content/plans"],
  ["FAQs", "/admin/content/faqs"],
  ["Personas", "/admin/content/personas"],
  ["Theme and fonts", "/admin/theme"],
  ["Feature switches", "/admin/flags"],
  ["Payment gateways", "/admin/gateways"],
  ["Images", "/admin/media"],
  ["Messages", "/admin/messages"],
];

export function AdminNav() {
  return (
    <nav className="faq-list" aria-label="Admin">
      {LINKS.map(([label, href]) => (
        <Link key={href} href={href} style={{ display: "block", padding: "8px 0" }}>{label}</Link>
      ))}
    </nav>
  );
}
