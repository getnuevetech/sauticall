export type Permission = { key: string; group: string; label: string; description: string };

export const PERMISSIONS: Permission[] = [
  { key: "content.home", group: "Website", label: "Home page", description: "Edit the public home page." },
  { key: "content.solutions", group: "Website", label: "Solutions page", description: "Edit the solutions page." },
  { key: "content.ai", group: "Website", label: "AI receptionist page", description: "Edit the AI receptionist page." },
  { key: "content.how", group: "Website", label: "How it works page", description: "Edit the how-it-works page." },
  { key: "content.pricing", group: "Website", label: "Pricing page", description: "Edit the pricing page wording." },
  { key: "content.about", group: "Website", label: "About page", description: "Edit the about page." },
  { key: "content.contact", group: "Website", label: "Contact page", description: "Edit the contact page." },
  { key: "content.custom", group: "Website", label: "Custom plan page", description: "Edit the custom plan page." },
  { key: "content.nav", group: "Website", label: "Menu", description: "Edit the header and account menu." },
  { key: "content.footer", group: "Website", label: "Footer", description: "Edit the footer." },
  { key: "content.services", group: "Website", label: "Services", description: "Edit the service cards." },
  { key: "content.plans", group: "Website", label: "Plans", description: "Edit plan names, prices, and included minutes." },
  { key: "content.bundles", group: "Website", label: "Call minute bundles", description: "Edit minute bundles customers can buy." },
  { key: "content.faqs", group: "Website", label: "Pricing questions", description: "Edit the short questions on the pricing page." },
  { key: "content.personas", group: "Website", label: "Who it's for", description: "Edit the audience cards." },
  { key: "content.account", group: "Website", label: "Account wording", description: "Edit the words customers see inside their account." },
  { key: "settings.theme", group: "Settings", label: "Colors and font", description: "Change colors, font, and the logo address." },
  { key: "settings.flags", group: "Settings", label: "Feature switches", description: "Turn customer features on or off." },
  { key: "settings.payments", group: "Settings", label: "Payments", description: "Add and check Stripe, PayPal, and Square." },
  { key: "settings.connections", group: "Settings", label: "Phone connections", description: "Save VoIP.ms and 3CX credentials." },
  { key: "settings.phone", group: "Settings", label: "Extensions and groups", description: "See extensions, ring groups, and call queues, and retry them on 3CX." },
  { key: "settings.lines", group: "Settings", label: "Lines and trunks", description: "See purchased numbers, trunks, emergency addresses, and call-minute limits." },
  { key: "inbox.messages", group: "Inbox", label: "Messages", description: "Read contact and custom-plan messages." },
  { key: "inbox.requests", group: "Inbox", label: "Number and transfer requests", description: "Update number orders and number transfers." },
  { key: "inbox.media", group: "Inbox", label: "Images", description: "Upload pictures for the site." },
  { key: "access.manage", group: "Access", label: "Access levels and staff", description: "Create access levels and staff accounts." },
  { key: "tickets.view", group: "Tickets", label: "Tickets for your groups", description: "See tickets routed to a group this person belongs to." },
  { key: "tickets.view_all", group: "Tickets", label: "Every ticket", description: "See tickets for every group." },
  { key: "tickets.reply", group: "Tickets", label: "Reply to tickets", description: "Reply to tickets this person is allowed to see, including internal notes." },
  { key: "tickets.manage", group: "Tickets", label: "Ticket routing and email", description: "Choose which group receives each topic, and set inbound and outbound email." },
  { key: "blog.manage", group: "FAQ blog", label: "FAQ articles", description: "Write, publish, and unpublish FAQ articles." },
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map((item) => item.key));

export type AccessRoleSeed = { name: string; description: string; permissions: string[] };

export const DEFAULT_ROLES: AccessRoleSeed[] = [
  {
    name: "Customer support",
    description: "Read site messages, handle tickets for their group, and publish FAQ articles. No payments, phone credentials, or site settings.",
    permissions: ["inbox.messages", "tickets.view", "tickets.reply", "blog.manage"],
  },
  {
    name: "Accounts",
    description: "Take payments and update number or transfer requests. No website editing and no phone-company credentials.",
    permissions: ["settings.payments", "inbox.requests", "tickets.view", "tickets.reply"],
  },
  {
    name: "Website",
    description: "Edit the public site, pictures, and FAQ articles. No payments or phone connections.",
    permissions: [
      "content.home",
      "content.solutions",
      "content.ai",
      "content.how",
      "content.pricing",
      "content.about",
      "content.contact",
      "content.custom",
      "content.nav",
      "content.footer",
      "content.services",
      "content.plans",
      "content.bundles",
      "content.faqs",
      "content.personas",
      "content.account",
      "settings.theme",
      "inbox.media",
      "blog.manage",
    ],
  },
  {
    name: "Phone operations",
    description: "Run extensions, ring groups, queues, lines, and the VoIP.ms and 3CX connections.",
    permissions: ["settings.phone", "settings.lines", "settings.connections", "tickets.view", "tickets.reply"],
  },
];

export function knownPermissions(keys: string[]) {
  return keys.filter((key) => PERMISSION_KEYS.has(key));
}

const DOCUMENT_PERMISSIONS: Record<string, string> = {
  "page.home": "content.home",
  "page.solutions": "content.solutions",
  "page.ai": "content.ai",
  "page.how": "content.how",
  "page.pricing": "content.pricing",
  "page.about": "content.about",
  "page.contact": "content.contact",
  "page.custom": "content.custom",
  "page.account": "content.account",
  nav: "content.nav",
  footer: "content.footer",
  services: "content.services",
  plans: "content.plans",
  minute_bundles: "content.bundles",
  faqs: "content.faqs",
  personas: "content.personas",
  flags: "settings.flags",
  theme: "settings.theme",
};

export function permissionForDocument(key: string) {
  return DOCUMENT_PERMISSIONS[key] || "";
}

export type AdminLink = { label: string; href: string; permission: string | string[] };

export const ADMIN_NAV: { title: string; links: AdminLink[] }[] = [
  {
    title: "Website",
    links: [
      { label: "Home", href: "/admin/content/page.home", permission: "content.home" },
      { label: "Solutions", href: "/admin/content/page.solutions", permission: "content.solutions" },
      { label: "AI receptionist", href: "/admin/content/page.ai", permission: "content.ai" },
      { label: "How it works", href: "/admin/content/page.how", permission: "content.how" },
      { label: "Pricing", href: "/admin/content/page.pricing", permission: "content.pricing" },
      { label: "About", href: "/admin/content/page.about", permission: "content.about" },
      { label: "Contact", href: "/admin/content/page.contact", permission: "content.contact" },
      { label: "Custom plan", href: "/admin/content/page.custom", permission: "content.custom" },
      { label: "Menu", href: "/admin/content/nav", permission: "content.nav" },
      { label: "Footer", href: "/admin/content/footer", permission: "content.footer" },
      { label: "Services", href: "/admin/content/services", permission: "content.services" },
      { label: "Plans", href: "/admin/content/plans", permission: "content.plans" },
      { label: "Call minute bundles", href: "/admin/content/minute_bundles", permission: "content.bundles" },
      { label: "Questions", href: "/admin/content/faqs", permission: "content.faqs" },
      { label: "Who it's for", href: "/admin/content/personas", permission: "content.personas" },
    ],
  },
  {
    title: "Account",
    links: [{ label: "Account wording", href: "/admin/content/page.account", permission: "content.account" }],
  },
  {
    title: "Settings",
    links: [
      { label: "Colors and font", href: "/admin/theme", permission: "settings.theme" },
      { label: "What customers can do", href: "/admin/flags", permission: "settings.flags" },
      { label: "Payments", href: "/admin/gateways", permission: "settings.payments" },
      { label: "Phone connections", href: "/admin/connections", permission: "settings.connections" },
      { label: "Extensions and groups", href: "/admin/phone", permission: "settings.phone" },
      { label: "Lines and trunks", href: "/admin/lines", permission: "settings.lines" },
    ],
  },
  {
    title: "Inbox",
    links: [
      { label: "Messages", href: "/admin/messages", permission: "inbox.messages" },
      { label: "Number and transfer requests", href: "/admin/requests", permission: "inbox.requests" },
      { label: "Images", href: "/admin/media", permission: "inbox.media" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Tickets", href: "/admin/tickets", permission: ["tickets.view", "tickets.view_all", "tickets.reply"] },
      { label: "Ticket routing and email", href: "/admin/tickets/settings", permission: "tickets.manage" },
      { label: "FAQ articles", href: "/admin/faq", permission: "blog.manage" },
    ],
  },
  {
    title: "Access",
    links: [{ label: "Access levels", href: "/admin/access", permission: "access.manage" }],
  },
];
