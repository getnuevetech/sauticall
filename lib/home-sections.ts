export const PAGE_DESTINATIONS = [
  { value: "/", label: "Home" },
  { value: "/solutions", label: "Solutions" },
  { value: "/ai-receptionist", label: "AI receptionist" },
  { value: "/how-it-works", label: "How it works" },
  { value: "/pricing", label: "Pricing" },
  { value: "/about", label: "About" },
  { value: "/contact", label: "Contact" },
  { value: "/custom", label: "Custom plan" },
  { value: "/faq", label: "Help center" },
  { value: "/account/register", label: "Create account" },
  { value: "/account/login", label: "Sign in" },
  { value: "#plans", label: "Plans on this page" },
  { value: "#products", label: "Products on this page" },
  { value: "#ai-demo", label: "Setup assistant on this page" },
];

export type HomeField = {
  key: string;
  path: string[];
  kind: "text" | "lines" | "rows";
  columns?: { key: string; href?: boolean }[];
};

export type HomeSection = { id: string; label: string; keys: string[]; fields: HomeField[] };

const SHOWN_SECTIONS: { id: string; label: string; keys: string[]; columns?: Record<string, { key: string; href?: boolean }[] | undefined> }[] = [
  { id: "hero", label: "Hero", keys: ["kicker", "title", "titleAccent", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "plansFrom", "fineNote", "heroAlt"] },
  { id: "strip", label: "Feature strip", keys: ["strip"], columns: { strip: [{ key: "title" }, { key: "body" }] } },
  { id: "together", label: "Feature cards", keys: ["togetherTitle", "togetherBody", "cards"], columns: { cards: [{ key: "title" }, { key: "body" }, { key: "href", href: true }, { key: "link" }] } },
  { id: "ai", label: "AI receptionist", keys: ["aiKicker", "aiTitle", "aiBody", "aiPoints", "aiCta", "aiHref", "aiFine", "aiAlt"] },
  { id: "setup", label: "Setup", keys: ["setupTitle", "setupPrompt", "setupButton", "setupSteps", "setupFine"], columns: { setupSteps: [{ key: "title" }, { key: "body" }] } },
  { id: "pricing", label: "Pricing words", keys: ["priceTitle", "priceBody", "ribbon", "customLead", "customCta", "customHref"] },
  { id: "faq", label: "Questions", keys: ["faqTitle", "faqs"], columns: { faqs: [{ key: "q" }, { key: "a" }] } },
  { id: "close", label: "Final call to action", keys: ["endTitle", "endCta", "endHref", "endSecondary", "endSecondaryHref"] },
];

const FLAT_SECTIONS: { id: string; label: string; keys: string[] }[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "titleLead", "titleAccent", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "faces", "faceCaption", "checks"] },
  { id: "phone", label: "Sample phone", keys: ["phoneBrand", "phoneTitle", "phoneSub", "phoneBadge1", "phoneBadge2", "chipAnswered", "chipRoute", "chipAppointment", "visualLabel"] },
  { id: "audience", label: "Audience", keys: ["personaEyebrow", "personaTitle"] },
  { id: "language", label: "Any language", keys: ["languageEyebrow", "languageTitle", "languageBody", "languageException", "languageBadge"] },
  { id: "pricing", label: "Pricing words", keys: ["priceEyebrow", "priceTitle", "priceBody", "ribbon", "disclaimer"] },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
  { id: "assistant", label: "Setup assistant", keys: ["chatTitle", "chatSub", "chatStatus", "chatHello", "chatSampleUser", "chatProposal", "chatPoints", "chatFoot", "chatPlaceholder", "chatResultTitle", "chatResultNote"] },
  { id: "story", label: "Other home wording", keys: ["situationEyebrow", "situationTitle", "situationBody", "easyEyebrow", "easyTitle", "easyTitleEm", "easyBody", "easyCta", "easyHref"] },
];

const HEADER_KEYS = ["headerTalk", "headerTalkHref", "headerSignIn", "headerCta", "headerCtaHref"];
const SEO_KEYS = ["metaTitle", "metaDescription"];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function shownCopy(page: Record<string, unknown>) {
  return record(page.shown) ? page.shown : null;
}

function fieldFor(key: string, path: string[], columns?: { key: string; href?: boolean }[]): HomeField {
  const valueHint = columns ? "rows" : key.endsWith("Points") || key === "faces" || key === "checks" ? "lines" : "text";
  return { key, path, kind: columns ? "rows" : valueHint, columns };
}

export function homeSections(page: Record<string, unknown>): HomeSection[] {
  const shown = shownCopy(page);
  const source = shown ?? page;
  const used = new Set<string>();
  const sections: HomeSection[] = [];
  const templates = shown ? SHOWN_SECTIONS : FLAT_SECTIONS;
  for (const template of templates) {
    const fields: HomeField[] = [];
    for (const key of template.keys) {
      if (!(key in source) && !(key in page)) continue;
      used.add(key);
      const bag = "columns" in template ? template.columns as Record<string, { key: string; href?: boolean }[] | undefined> | undefined : undefined;
      const columns = bag?.[key];
      fields.push(fieldFor(key, shown ? ["shown", key] : [key], columns));
    }
    if (fields.length) sections.push({ id: template.id, label: template.label, keys: fields.map((field) => field.key), fields });
  }
  const header = HEADER_KEYS.filter((key) => key in page).map((key) => fieldFor(key, [key]));
  if (header.length) sections.push({ id: "header", label: "Header buttons", keys: header.map((field) => field.key), fields: header });
  const seo = SEO_KEYS.filter((key) => key in page).map((key) => fieldFor(key, [key]));
  if (seo.length) sections.push({ id: "seo", label: "SEO", keys: seo.map((field) => field.key), fields: seo });
  header.forEach((field) => used.add(field.key));
  seo.forEach((field) => used.add(field.key));
  const rest = Object.keys(source).filter((key) => !used.has(key) && key !== "shown");
  if (rest.length) {
    const fields = rest.map((key) => {
      const value = source[key];
      const columns = Array.isArray(value) && value.every((item) => record(item))
        ? [...new Set(value.flatMap((item) => Object.keys(item as Record<string, unknown>)))].map((name) => ({ key: name, href: name === "href" || name.endsWith("Href") }))
        : undefined;
      return fieldFor(key, shown ? ["shown", key] : [key], columns);
    });
    sections.push({ id: "more", label: "More fields", keys: rest, fields });
  }
  return sections;
}

export function homeValue(page: Record<string, unknown>, path: string[]) {
  let current: unknown = page;
  for (const key of path) {
    if (!record(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function homePreview(page: Record<string, unknown>) {
  const shown = shownCopy(page);
  const read = (shownKey: string, flatKey: string) => {
    const value = shown ? shown[shownKey] ?? page[flatKey] : page[flatKey];
    return typeof value === "string" ? value : "";
  };
  return {
    kicker: read("kicker", "eyebrow"),
    title: read("title", "titleLead"),
    accent: read("titleAccent", "titleAccent"),
    lead: read("lead", "lead"),
    button: read("primaryCta", "primaryCta"),
  };
}

export function destinationChoices(current: string) {
  if (PAGE_DESTINATIONS.some((item) => item.value === current)) return PAGE_DESTINATIONS;
  return [{ value: current, label: current || "Current destination" }, ...PAGE_DESTINATIONS];
}
