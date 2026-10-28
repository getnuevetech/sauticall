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
  { value: "/account/porting", label: "Number transfer" },
  { value: "/account/minutes", label: "Call minutes" },
  { value: "/account/security", label: "Security" },
  { value: "/account/tickets", label: "Support tickets" },
  { value: "#plans", label: "Plans on this page" },
  { value: "#phone", label: "Phone system on this page" },
  { value: "#phones", label: "Desk phones on this page" },
  { value: "#ai", label: "AI receptionist on this page" },
  { value: "#center", label: "Contact center on this page" },
  { value: "#numbers", label: "Numbers on this page" },
  { value: "#assistant", label: "Setup assistant on this page" },
  { value: "#products", label: "Products on this page" },
  { value: "#ai-demo", label: "Setup assistant on this page" },
];

export const PAGE_PUBLIC: Record<string, string> = {
  "page.home": "/",
  "page.solutions": "/solutions",
  "page.ai": "/ai-receptionist",
  "page.how": "/how-it-works",
  "page.pricing": "/pricing",
  "page.about": "/about",
  "page.contact": "/contact",
  "page.custom": "/custom",
  "page.help": "/faq",
};

export type HomeField = {
  key: string;
  path: string[];
  kind: "text" | "lines" | "rows";
  columns?: { key: string; href?: boolean }[];
};

export type HomeSection = { id: string; label: string; keys: string[]; fields: HomeField[] };

type Column = { key: string; href?: boolean };
type Template = { id: string; label: string; keys: string[]; columns?: Record<string, Column[] | undefined> };

const pair = (title = "title", body = "body"): Column[] => [{ key: title }, { key: body }];
const linkRow = (label = "label"): Column[] => [{ key: label }, { key: "href", href: true }];

const HOME_SHOWN: Template[] = [
  { id: "hero", label: "Hero", keys: ["kicker", "title", "titleAccent", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "plansFrom", "fineNote", "heroAlt"] },
  { id: "strip", label: "Feature strip", keys: ["strip"], columns: { strip: pair() } },
  { id: "together", label: "Feature cards", keys: ["togetherTitle", "togetherBody", "cards"], columns: { cards: [...pair(), { key: "href", href: true }, { key: "link" }] } },
  { id: "ai", label: "AI receptionist", keys: ["aiKicker", "aiTitle", "aiBody", "aiPoints", "aiCta", "aiHref", "aiFine", "aiAlt"] },
  { id: "setup", label: "Setup", keys: ["setupTitle", "setupPrompt", "setupButton", "setupSteps", "setupFine"], columns: { setupSteps: pair() } },
  { id: "pricing", label: "Pricing words", keys: ["priceTitle", "priceBody", "ribbon", "customLead", "customCta", "customHref"] },
  { id: "faq", label: "Questions", keys: ["faqTitle", "faqs"], columns: { faqs: [{ key: "q" }, { key: "a" }] } },
  { id: "close", label: "Final call to action", keys: ["endTitle", "endCta", "endHref", "endSecondary", "endSecondaryHref"] },
];

const HOME_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "titleLead", "titleAccent", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "faces", "faceCaption", "checks"] },
  { id: "phone", label: "Sample phone", keys: ["phoneBrand", "phoneTitle", "phoneSub", "phoneBadge1", "phoneBadge2", "chipAnswered", "chipRoute", "chipAppointment", "visualLabel"] },
  { id: "audience", label: "Audience", keys: ["personaEyebrow", "personaTitle"] },
  { id: "language", label: "Any language", keys: ["languageEyebrow", "languageTitle", "languageBody", "languageException", "languageBadge"] },
  { id: "pricing", label: "Pricing words", keys: ["priceEyebrow", "priceTitle", "priceBody", "ribbon", "disclaimer"] },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
  { id: "assistant", label: "Setup assistant", keys: ["chatTitle", "chatSub", "chatStatus", "chatHello", "chatSampleUser", "chatProposal", "chatPoints", "chatFoot", "chatPlaceholder", "chatResultTitle", "chatResultNote"] },
  { id: "story", label: "Other home wording", keys: ["situationEyebrow", "situationTitle", "situationBody", "easyEyebrow", "easyTitle", "easyTitleEm", "easyBody", "easyCta", "easyHref"] },
];

const SOLUTIONS_SHOWN: Template[] = [
  { id: "hero", label: "Hero", keys: ["kicker", "title", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "heroAlt"] },
  { id: "jumps", label: "Section links", keys: ["jumps"], columns: { jumps: linkRow() } },
  { id: "choose", label: "Choices", keys: ["chooseTitle", "choices"], columns: { choices: linkRow() } },
  { id: "phone", label: "Phone system", keys: ["phoneKicker", "phoneTitle", "phoneBody", "phonePoints", "phoneLink", "phoneHref"] },
  { id: "desk", label: "Desk and mobile", keys: ["deskKicker", "deskTitle", "deskBody", "deskPills", "deskLink", "deskHref", "deskAlt"] },
  { id: "ai", label: "AI receptionist", keys: ["aiKicker", "aiTitle", "aiBody", "aiPills", "aiCta", "aiHref", "aiNote"] },
  { id: "center", label: "Contact center", keys: ["centerKicker", "centerTitle", "centerBody", "centerPoints", "centerLink", "centerHref"] },
  { id: "numbers", label: "Numbers", keys: ["numbersKicker", "numbersTitle", "newNumberTitle", "newNumberBody", "newNumberCta", "newNumberHref", "keepNumberTitle", "keepNumberBody", "keepNumberCta", "keepNumberHref", "numbersFine"] },
  { id: "unsure", label: "Setup prompt", keys: ["unsureTitle", "unsureBody", "unsurePlaceholder", "unsureButton"] },
  { id: "close", label: "Final call to action", keys: ["endTitle", "endCta", "endHref", "endSecondary", "endSecondaryHref"] },
];

const SOLUTIONS_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
  { id: "offerings", label: "Offerings", keys: ["sectionEyebrow", "sectionTitle", "sectionBody", "exploreLabel"] },
  { id: "phones", label: "Desk phones", keys: ["phonesEyebrow", "phonesTitle", "phonesTitleEm", "phonesBody", "phonesPoints"] },
  { id: "device", label: "Sample device", keys: ["deviceHeader", "deviceReady", "deviceExt", "deviceState"] },
  { id: "numbers", label: "Numbers", keys: ["numbersTitle", "numbersBody", "portingTitle", "portingBody"] },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
];

const AI_SHOWN: Template[] = [
  { id: "hero", label: "Hero", keys: ["kicker", "title", "titleAccent", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "heroAlt"] },
  { id: "points", label: "What it does", keys: ["points"], columns: { points: pair() } },
  { id: "flow", label: "Call flow", keys: ["flowKicker", "flowTitle"] },
  { id: "built", label: "Built around the business", keys: ["builtTitle", "built"], columns: { built: pair() } },
  { id: "choose", label: "Controls", keys: ["chooseTitle", "chooseBody", "choosePoints"] },
  { id: "language", label: "Languages", keys: ["languageTitle", "languageBody", "languageLink", "languageHref"] },
  { id: "steps", label: "Steps", keys: ["stepsTitle", "steps", "stepsFine"], columns: { steps: pair() } },
  { id: "finder", label: "Plan finder", keys: ["finderTitle", "finderTeam", "finderLanguage", "finderButton"] },
  { id: "review", label: "Review", keys: ["reviewTitle", "reviewBody", "reviewLink", "reviewHref"] },
  { id: "faq", label: "Questions", keys: ["faqTitle", "faqs"], columns: { faqs: [{ key: "q" }, { key: "a" }] } },
  { id: "close", label: "Final call to action", keys: ["endTitle", "endCta", "endHref", "endSecondary", "endSecondaryHref"] },
];

const AI_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
  { id: "story", label: "Story", keys: ["storyEyebrow", "storyTitle", "storyBody", "points"] },
  { id: "language", label: "Languages", keys: ["languageEyebrow", "languageTitle", "languageBody", "languageException"] },
  { id: "control", label: "Controls", keys: ["controlEyebrow", "controlTitle", "controlBody", "cards"], columns: { cards: [{ key: "icon" }, ...pair()] } },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
];

const HOW_SHOWN: Template[] = [
  { id: "hero", label: "Hero", keys: ["kicker", "title", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref"] },
  { id: "steps", label: "Steps", keys: ["stepsTitle", "steps"], columns: { steps: pair() } },
  { id: "assist", label: "Setup assistant", keys: ["assistKicker", "assistTitle", "assistBody"] },
  { id: "cards", label: "Cards", keys: ["cards"], columns: { cards: pair() } },
  { id: "close", label: "Final call to action", keys: ["endTitle", "endCta", "endHref", "endSecondary", "endSecondaryHref"] },
];

const HOW_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
  { id: "steps", label: "Steps", keys: ["sectionEyebrow", "sectionTitle", "sectionBody", "steps"], columns: { steps: [{ key: "n" }, ...pair()] } },
  { id: "detail", label: "Details", keys: ["detailEyebrow", "detailTitle", "detailBody", "cards"], columns: { cards: [{ key: "icon" }, ...pair()] } },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
];

const PRICING_ROOT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
];

const PRICING_SHOWN: Template[] = [
  { id: "plans", label: "Plan cards", keys: ["ribbon", "note", "verb", "homeVerb", "blurbs", "customTitle", "customBody", "customCta", "customHref"], columns: { blurbs: [{ key: "name" }, { key: "text" }] } },
  { id: "compare", label: "Comparison", keys: ["compareTitle", "compareFeature", "comparePeople", "compareMinutes", "compareSoftphone", "compareVoicemail", "compareDesk", "compareHours", "compareAi", "compareQueues", "compareReporting"] },
  { id: "phrases", label: "Plan card words", keys: ["inherit", "queues", "reporting", "desk", "deskSupport", "hours", "rings", "ai", "softphone", "voicemail", "peopleOne", "peopleMany", "minutes", "minutesPeriod", "month"] },
  { id: "costs", label: "Other costs", keys: ["costTitle", "costs"], columns: { costs: pair() } },
  { id: "bundles", label: "Minute bundles", keys: ["bundlesTitle", "bundlesFine", "bundlesLink", "bundlesHref"] },
  { id: "finder", label: "Plan finder", keys: ["finderTitle", "finderBody", "finderTeam", "finderAi", "finderButton", "finderFine"] },
  { id: "faq", label: "Questions", keys: ["faqTitle", "faqs"], columns: { faqs: [{ key: "q" }, { key: "a" }] } },
  { id: "close", label: "Final call to action", keys: ["endTitle", "endCta", "endHref", "endSecondary", "endSecondaryHref"] },
];

const PRICING_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead", "ribbon", "languageBadge", "disclaimer"] },
  { id: "estimate", label: "Estimate", keys: ["estimateEyebrow", "estimateTitle", "estimateBody", "estimatePlanLabel", "estimateAiLabel", "aiAddonPrice", "estimateTotalLabel", "estimateCta", "estimateHref"] },
  { id: "faq", label: "Questions", keys: ["faqEyebrow", "faqTitle", "faqBody"] },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
];

const ABOUT_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
  { id: "vision", label: "Vision", keys: ["visionEyebrow", "visionTitle", "visionTitleEm", "visionBody1", "visionBody2", "values"], columns: { values: [{ key: "icon" }, ...pair()] } },
  { id: "hood", label: "Under the hood", keys: ["hoodEyebrow", "hoodTitle", "hoodBody", "cards"], columns: { cards: [{ key: "icon" }, ...pair()] } },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
];

const CONTACT_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
  { id: "side", label: "Introduction", keys: ["sideEyebrow", "sideTitle", "sideBody", "steps", "note"], columns: { steps: [{ key: "icon" }, { key: "label" }] } },
  { id: "form", label: "Form", keys: ["formTitle", "nameLabel", "namePlaceholder", "emailLabel", "emailPlaceholder", "serviceLabel", "services", "messageLabel", "messagePlaceholder", "submitLabel", "thanks", "closed"] },
  { id: "faq", label: "Questions", keys: ["faqEyebrow", "faqTitle", "faqBody"] },
];

const CUSTOM_FLAT: Template[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "title", "titleEm", "lead"] },
  { id: "side", label: "Introduction", keys: ["sideEyebrow", "sideTitle", "sideBody", "steps", "note"], columns: { steps: [{ key: "icon" }, { key: "label" }] } },
  { id: "form", label: "Form", keys: ["formTitle", "nameLabel", "namePlaceholder", "companyLabel", "companyPlaceholder", "emailLabel", "emailPlaceholder", "phoneLabel", "phonePlaceholder", "needsLabel", "needsPlaceholder", "submitLabel", "thanks", "closed"] },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
];

const HELP_SHOWN: Template[] = [
  { id: "hero", label: "Hero", keys: ["kicker", "title", "lead", "searchLabel", "searchPlaceholder", "popular"] },
  { id: "topics", label: "Topics", keys: ["topicsTitle", "topics"], columns: { topics: [{ key: "id" }, { key: "label" }] } },
  { id: "questions", label: "Questions", keys: ["questionsTitle", "questionsLead", "empty", "guide"], columns: { guide: [...pair(), { key: "href", href: true }, { key: "topic" }, { key: "link" }] } },
  { id: "chips", label: "Popular topics", keys: ["chips"], columns: { chips: [{ key: "id" }, { key: "label" }] } },
  { id: "side", label: "Account help", keys: ["sideTitle", "sideBody", "sideCta", "sideHref"] },
  { id: "jumps", label: "Next steps", keys: ["jumps"], columns: { jumps: [...pair(), { key: "href", href: true }, { key: "link" }] } },
  { id: "ask", label: "Still need help", keys: ["askTitle", "askBody", "askCta", "askHref", "askSecondary", "askSecondaryHref"] },
  { id: "article", label: "Article pages", keys: ["articleEyebrow", "articleBack"] },
];

const SHOWN: Record<string, Template[]> = {
  "page.home": HOME_SHOWN,
  "page.solutions": SOLUTIONS_SHOWN,
  "page.ai": AI_SHOWN,
  "page.how": HOW_SHOWN,
  "page.pricing": PRICING_SHOWN,
  "page.help": HELP_SHOWN,
};

const FLAT: Record<string, Template[]> = {
  "page.home": HOME_FLAT,
  "page.solutions": SOLUTIONS_FLAT,
  "page.ai": AI_FLAT,
  "page.how": HOW_FLAT,
  "page.pricing": PRICING_FLAT,
  "page.about": ABOUT_FLAT,
  "page.contact": CONTACT_FLAT,
  "page.custom": CUSTOM_FLAT,
};

const ROOT: Record<string, Template[]> = {
  "page.pricing": PRICING_ROOT,
};

const HEADER_KEYS = ["headerTalk", "headerTalkHref", "headerSignIn", "headerCta", "headerCtaHref"];
const SEO_KEYS = ["metaTitle", "metaDescription"];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function shownCopy(page: Record<string, unknown>) {
  return record(page.shown) ? page.shown : null;
}

export function usesSectionEditor(docKey: string) {
  return docKey in SHOWN || docKey in FLAT;
}

function fieldFor(key: string, path: string[], columns?: Column[]): HomeField {
  const lines = key.endsWith("Points") || key.endsWith("Pills") || key === "faces" || key === "checks" || key === "services";
  return { key, path, kind: columns ? "rows" : lines ? "lines" : "text", columns };
}

function take(templates: Template[], source: Record<string, unknown>, prefix: string[]) {
  const used = new Set<string>();
  const sections: HomeSection[] = [];
  for (const template of templates) {
    const fields: HomeField[] = [];
    for (const key of template.keys) {
      if (!(key in source)) continue;
      used.add(key);
      fields.push(fieldFor(key, [...prefix, key], template.columns?.[key]));
    }
    if (fields.length) sections.push({ id: template.id, label: template.label, keys: fields.map((field) => field.key), fields });
  }
  return { used, sections };
}

function restSection(source: Record<string, unknown>, used: Set<string>, prefix: string[]) {
  const keys = Object.keys(source).filter((key) => !used.has(key) && key !== "shown");
  if (!keys.length) return null;
  const fields = keys.map((key) => {
    const value = source[key];
    const columns = Array.isArray(value) && value.every((item) => record(item))
      ? [...new Set(value.flatMap((item) => Object.keys(item as Record<string, unknown>)))].map((name) => ({ key: name, href: name === "href" || name.endsWith("Href") }))
      : undefined;
    return fieldFor(key, [...prefix, key], columns);
  });
  return { id: "more", label: "More fields", keys, fields };
}

export function pageSections(docKey: string, page: Record<string, unknown>): HomeSection[] {
  const shown = shownCopy(page);
  const shownTemplates = SHOWN[docKey];
  const useShown = Boolean(shown && shownTemplates);
  const source = useShown && shown ? shown : page;
  const prefix = useShown ? ["shown"] : [];
  const root = useShown ? take(ROOT[docKey] || [], page, []) : { used: new Set<string>(), sections: [] as HomeSection[] };
  const body = take((useShown ? shownTemplates : FLAT[docKey] || shownTemplates) || [], source, prefix);
  const sections = [...root.sections, ...body.sections];
  const used = new Set<string>([...root.used, ...body.used]);
  if (docKey === "page.home") {
    const header = HEADER_KEYS.filter((key) => key in page).map((key) => fieldFor(key, [key]));
    if (header.length) sections.push({ id: "header", label: "Header buttons", keys: header.map((field) => field.key), fields: header });
    header.forEach((field) => used.add(field.key));
  }
  const seo = SEO_KEYS.filter((key) => key in page && !used.has(key)).map((key) => fieldFor(key, [key]));
  if (seo.length) sections.push({ id: "seo", label: "SEO", keys: seo.map((field) => field.key), fields: seo });
  seo.forEach((field) => used.add(field.key));
  const extra = restSection(source, useShown ? body.used : used, prefix);
  if (extra) sections.push(extra);
  return sections;
}

export function homeSections(page: Record<string, unknown>) {
  return pageSections("page.home", page);
}

export function homeValue(page: Record<string, unknown>, path: string[]) {
  let current: unknown = page;
  for (const key of path) {
    if (!record(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function pagePreview(docKey: string, page: Record<string, unknown>) {
  const shown = shownCopy(page);
  const rootFirst = docKey === "page.pricing" || docKey === "page.about" || docKey === "page.contact" || docKey === "page.custom";
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const fromRoot = typeof page[key] === "string" ? page[key] : "";
      const fromShown = shown && typeof shown[key] === "string" ? shown[key] : "";
      const value = rootFirst ? fromRoot || fromShown : fromShown || fromRoot;
      if (value) return value;
    }
    return "";
  };
  return {
    kicker: read("kicker", "eyebrow"),
    title: read("title", "titleLead"),
    accent: read("titleAccent", "titleEm"),
    lead: read("lead"),
    button: read("primaryCta"),
  };
}

export function homePreview(page: Record<string, unknown>) {
  return pagePreview("page.home", page);
}

export function destinationChoices(current: string) {
  if (PAGE_DESTINATIONS.some((item) => item.value === current)) return PAGE_DESTINATIONS;
  return [{ value: current, label: current || "Current destination" }, ...PAGE_DESTINATIONS];
}
