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
  { key: "content.plans", group: "Website", label: "Plans", description: "Edit plan names, prices, extensions included, included minutes, and the phone-company balance." },
  { key: "content.bundles", group: "Website", label: "Call minute bundles", description: "Edit minute bundles customers can buy." },
  { key: "content.faqs", group: "Website", label: "Help and questions", description: "Edit the help center and the questions that also appear on the contact page." },
  { key: "content.personas", group: "Website", label: "Who it's for", description: "Edit the audience cards." },
  { key: "content.account", group: "Website", label: "Account wording", description: "Edit the words customers see inside their account." },
  { key: "settings.theme", group: "Website", label: "Colors and font", description: "Change colors, font, and the logo address." },
  { key: "inbox.media", group: "Website", label: "Images", description: "Upload pictures for the site." },
  { key: "blog.manage", group: "Website", label: "FAQ articles", description: "Write, publish, and unpublish FAQ articles." },
  { key: "settings.payments", group: "Integrations", label: "Payment APIs", description: "Add and check Stripe, PayPal, and Square." },
  { key: "settings.connections", group: "Integrations", label: "Phone connections", description: "Save VoIP.ms and 3CX credentials." },
  { key: "settings.flags", group: "Integrations", label: "Live switches", description: "Turn live ordering, provisioning, and other customer features on or off." },
  { key: "settings.phone", group: "Phone", label: "Extensions and groups", description: "Choose where extension numbers start. How many a customer can add is set on each plan." },
  { key: "settings.lines", group: "Phone", label: "Lines and trunks", description: "See purchased numbers, trunks, emergency addresses, and call-minute limits." },
  { key: "users.customers", group: "Customers", label: "Customer accounts", description: "See customer accounts, reset passwords, and turn sign-in on or off." },
  { key: "inbox.messages", group: "Customers", label: "Contact messages", description: "Read contact and custom-plan messages." },
  { key: "inbox.requests", group: "Customers", label: "Number and transfer requests", description: "Update number orders and number transfers." },
  { key: "access.manage", group: "Team", label: "Admin users and access levels", description: "Create admin accounts, assign access levels, and edit what each level can open." },
  { key: "tickets.view", group: "Tickets", label: "Tickets for your groups", description: "See tickets routed to a group this person belongs to." },
  { key: "tickets.view_all", group: "Tickets", label: "Every ticket", description: "See tickets for every group." },
  { key: "tickets.reply", group: "Tickets", label: "Reply to tickets", description: "Reply to tickets this person is allowed to see, including internal notes." },
  { key: "tickets.manage", group: "Tickets", label: "Queues and email", description: "Choose which group receives each topic, and set inbound and outbound email." },
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map((item) => item.key));

export type AccessRoleSeed = { name: string; description: string; permissions: string[] };

export const DEFAULT_ROLES: AccessRoleSeed[] = [
  {
    name: "Customer support",
    description: "Read site messages, handle tickets for their group, and publish FAQ articles. No payments, phone credentials, or site settings.",
    permissions: ["inbox.messages", "users.customers", "tickets.view", "tickets.reply", "blog.manage"],
  },
  {
    name: "Accounts",
    description: "Take payments and update number or transfer requests. No website editing and no phone-company credentials.",
    permissions: ["settings.payments", "users.customers", "inbox.requests", "tickets.view", "tickets.reply"],
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
  "page.help": "content.faqs",
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
      { label: "Colors and font", href: "/admin/theme", permission: "settings.theme" },
      { label: "Images", href: "/admin/media", permission: "inbox.media" },
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
      { label: "Help center", href: "/admin/content/page.help", permission: "content.faqs" },
      { label: "More questions", href: "/admin/content/faqs", permission: "content.faqs" },
      { label: "Who it's for", href: "/admin/content/personas", permission: "content.personas" },
      { label: "Account wording", href: "/admin/content/page.account", permission: "content.account" },
      { label: "FAQ articles", href: "/admin/faq", permission: "blog.manage" },
    ],
  },
  {
    title: "Catalog",
    links: [
      { label: "Plans", href: "/admin/content/plans", permission: "content.plans" },
      { label: "Call minute bundles", href: "/admin/content/minute_bundles", permission: "content.bundles" },
    ],
  },
  {
    title: "Integrations",
    links: [
      { label: "Payment APIs", href: "/admin/gateways", permission: "settings.payments" },
      { label: "Phone connections", href: "/admin/connections", permission: "settings.connections" },
      { label: "Live switches", href: "/admin/flags", permission: "settings.flags" },
    ],
  },
  {
    title: "Phone",
    links: [
      { label: "Extensions and groups", href: "/admin/phone", permission: "settings.phone" },
      { label: "Lines and trunks", href: "/admin/lines", permission: "settings.lines" },
      { label: "3CX trunks", href: "/admin/trunks", permission: "settings.lines" },
    ],
  },
  {
    title: "Customers",
    links: [
      { label: "Customer accounts", href: "/admin/customers", permission: "users.customers" },
      { label: "Number requests", href: "/admin/requests", permission: "inbox.requests" },
      { label: "Failed requests", href: "/admin/failures", permission: ["inbox.requests", "settings.phone", "settings.lines", "settings.payments"] },
      { label: "Contact messages", href: "/admin/messages", permission: "inbox.messages" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Ticket desk", href: "/admin/tickets", permission: ["tickets.view", "tickets.view_all", "tickets.reply"] },
      { label: "Queues and email", href: "/admin/tickets/settings", permission: "tickets.manage" },
    ],
  },
  {
    title: "Team",
    links: [
      { label: "Admin users", href: "/admin/team", permission: "access.manage" },
      { label: "Access levels", href: "/admin/access", permission: "access.manage" },
    ],
  },
];
