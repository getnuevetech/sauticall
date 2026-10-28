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

const SECTIONS: { id: string; label: string; keys: string[] }[] = [
  { id: "hero", label: "Hero", keys: ["eyebrow", "titleLead", "titleAccent", "lead", "primaryCta", "primaryHref", "secondaryCta", "secondaryHref", "faces", "faceCaption", "checks"] },
  { id: "phone", label: "Sample phone", keys: ["phoneBrand", "phoneTitle", "phoneSub", "phoneBadge1", "phoneBadge2", "chipAnswered", "chipRoute", "chipAppointment", "visualLabel"] },
  { id: "audience", label: "Audience", keys: ["personaEyebrow", "personaTitle"] },
  { id: "language", label: "Any language", keys: ["languageEyebrow", "languageTitle", "languageBody", "languageException", "languageBadge"] },
  { id: "pricing", label: "Pricing words", keys: ["priceEyebrow", "priceTitle", "priceBody", "ribbon", "disclaimer"] },
  { id: "close", label: "Final call to action", keys: ["endEyebrow", "endTitle", "endBody", "endCta", "endHref"] },
  { id: "assistant", label: "Setup assistant", keys: ["chatTitle", "chatSub", "chatStatus", "chatHello", "chatSampleUser", "chatProposal", "chatPoints", "chatFoot", "chatPlaceholder", "chatResultTitle", "chatResultNote"] },
  { id: "story", label: "Other home wording", keys: ["situationEyebrow", "situationTitle", "situationBody", "easyEyebrow", "easyTitle", "easyTitleEm", "easyBody", "easyCta", "easyHref"] },
  { id: "header", label: "Header buttons", keys: ["headerTalk", "headerTalkHref", "headerCta", "headerCtaHref"] },
  { id: "seo", label: "SEO", keys: ["metaTitle", "metaDescription"] },
];

export function homeSections(page: Record<string, unknown>) {
  const used = new Set<string>();
  const sections = SECTIONS.map((section) => {
    const keys = section.keys.filter((key) => key in page);
    keys.forEach((key) => used.add(key));
    return { id: section.id, label: section.label, keys };
  }).filter((section) => section.keys.length > 0);
  const rest = Object.keys(page).filter((key) => !used.has(key));
  if (rest.length) sections.push({ id: "more", label: "More fields", keys: rest });
  return sections;
}

export function destinationChoices(current: string) {
  if (PAGE_DESTINATIONS.some((item) => item.value === current)) return PAGE_DESTINATIONS;
  return [{ value: current, label: current || "Current destination" }, ...PAGE_DESTINATIONS];
}
