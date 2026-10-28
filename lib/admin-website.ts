export type WebsiteLink = { name: string; href: string; url: string; permission: string; area: "pages" | "navigation" | "brand" | "library" };

export const WEBSITE_LINKS: WebsiteLink[] = [
  { name: "Home", href: "/admin/content/page.home", url: "/", permission: "content.home", area: "pages" },
  { name: "Solutions", href: "/admin/content/page.solutions", url: "/solutions", permission: "content.solutions", area: "pages" },
  { name: "AI receptionist", href: "/admin/content/page.ai", url: "/ai-receptionist", permission: "content.ai", area: "pages" },
  { name: "How it works", href: "/admin/content/page.how", url: "/how-it-works", permission: "content.how", area: "pages" },
  { name: "Pricing", href: "/admin/content/page.pricing", url: "/pricing", permission: "content.pricing", area: "pages" },
  { name: "About", href: "/admin/content/page.about", url: "/about", permission: "content.about", area: "pages" },
  { name: "Contact", href: "/admin/content/page.contact", url: "/contact", permission: "content.contact", area: "pages" },
  { name: "Custom plan", href: "/admin/content/page.custom", url: "/custom", permission: "content.custom", area: "pages" },
  { name: "Help center", href: "/admin/content/page.help", url: "/faq", permission: "content.faqs", area: "pages" },
  { name: "Header and menu", href: "/admin/content/nav", url: "Every public page", permission: "content.nav", area: "navigation" },
  { name: "Footer", href: "/admin/content/footer", url: "Every public page", permission: "content.footer", area: "navigation" },
  { name: "Brand styles", href: "/admin/theme", url: "Every public page", permission: "settings.theme", area: "brand" },
  { name: "Media library", href: "/admin/media", url: "Uploaded images", permission: "inbox.media", area: "brand" },
  { name: "Services", href: "/admin/content/services", url: "Home and solutions", permission: "content.services", area: "library" },
  { name: "More questions", href: "/admin/content/faqs", url: "Help center and contact", permission: "content.faqs", area: "library" },
  { name: "Who it's for", href: "/admin/content/personas", url: "Home", permission: "content.personas", area: "library" },
  { name: "FAQ articles", href: "/admin/faq", url: "/faq", permission: "blog.manage", area: "library" },
  { name: "Account wording", href: "/admin/content/page.account", url: "Signed-in account", permission: "content.account", area: "library" },
];

export const WEBSITE_PERMISSIONS = [...new Set(WEBSITE_LINKS.map((link) => link.permission))];

export function websiteArea(path: string) {
  if (path.startsWith("/admin/website") || path.startsWith("/admin/theme") || path.startsWith("/admin/media") || path.startsWith("/admin/faq")) return true;
  if (!path.startsWith("/admin/content/")) return false;
  return path !== "/admin/content/plans" && !path.startsWith("/admin/content/plans/") && !path.startsWith("/admin/content/minute_bundles");
}
