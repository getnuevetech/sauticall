import type Database from "better-sqlite3";
import { normalizePlans } from "./plan-features";
import { liveCopy, mergeMissingDeep, solutionsMenu } from "./public-copy";
import { defaultFlags, defaultPages, defaultPersonas, defaultPlans } from "./seed-data";
import type { Faq, Flag, NavLink, Persona, Plan } from "./types";

function readJson<T>(database: Database.Database, key: string): T | null {
  const row = database.prepare("SELECT json FROM documents WHERE key = ?").get(key) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}

function writeJson(database: Database.Database, key: string, value: unknown) {
  database.prepare("UPDATE documents SET json = ?, updated_at = ? WHERE key = ?").run(JSON.stringify(value), new Date().toISOString(), key);
}

function mergeMissing(current: Record<string, unknown>, extras: Record<string, unknown>) {
  let changed = false;
  for (const [key, value] of Object.entries(extras)) {
    if (current[key] === undefined) {
      current[key] = value;
      changed = true;
    }
  }
  return changed;
}

export function upgradeContent(database: Database.Database) {
  const flags = readJson<Flag[]>(database, "flags");
  if (flags) {
    let changed = false;
    for (const flag of defaultFlags) {
      if (!flags.some((item) => item.key === flag.key)) {
        flags.push(flag);
        changed = true;
      }
    }
    for (const flag of flags) {
      if (flag.key === "auth.mfa" && flag.description === "Require an authenticator code after password sign-in.") {
        flag.description = "Require an authenticator for every account at sign-in and before an app password is revealed. You can also require it for one customer from that customer's page.";
        changed = true;
      }
      if (flag.key === "auth.show_sign_in" && String(flag.description).includes("approved header")) {
        flag.enabled = true;
        flag.description = "Show Sign in in the header so a returning customer can open an account.";
        changed = true;
      }
      if (flag.key === "marketing.ai_demo" && String(flag.description).includes("sample")) {
        flag.label = "Setup assistant";
        flag.description = "Show the setup assistant. It matches a description to a real plan and opens signup.";
        changed = true;
      }
      if (flag.key === "marketing.estimator" && String(flag.description).includes("sample")) {
        flag.label = "Pricing plan picker";
        flag.description = "Show the plan picker on the pricing page. The button opens signup for that plan.";
        changed = true;
      }
      if (flag.key === "pbx.live_provision" && !flag.enabled && String(flag.description).includes("Leave this off until the 3CX connection is checked.")) {
        flag.enabled = true;
        flag.description = "Create a department and an extension on 3CX when a customer adds a person.";
        changed = true;
      }
      if (flag.key === "numbers.live_search" && !flag.enabled && flag.description === "Search VoIP.ms inventory when that connection is enabled.") {
        flag.enabled = true;
        flag.description = "Search VoIP.ms inventory so a customer can request a real available number.";
        changed = true;
      }
      if (flag.key === "numbers.live_order" && !flag.enabled && flag.description === "Allow a VoIP.ms order for a saved number request. This spends carrier balance.") {
        flag.enabled = true;
        flag.description = "Number search and buying stay live. A saved number can be ordered from VoIP.ms. This spends carrier balance.";
        changed = true;
      }
      if (flag.key === "numbers.auto_order" && !flag.enabled && flag.description === "When live number ordering is on, buy the number as soon as the customer requests it. Leave this off and staff buy it from Number and transfer requests.") {
        flag.enabled = true;
        flag.label = "Customers buy numbers themselves";
        flag.description = "Customers buy a number themselves, with no admin step. Turn this off and staff buy it from Number and transfer requests. Live number ordering stays on either way.";
        changed = true;
      }
      if (flag.key === "pbx.live_trunk" && !flag.enabled && flag.description === "When a number is bought, try to add it as a SIP trunk on that customer's department in 3CX. If this is off, or 3CX does not accept the trunk, the team finishes it on the 3CX server.") {
        flag.enabled = true;
        flag.description = "When a number is bought, route it through the customer's VoIP.ms SIP account and try to add the 3CX trunk, the inbound route, and an outbound rule limited to that customer's extensions. If a step is not accepted, it is logged for the team.";
        changed = true;
      }
    }
    if (changed) writeJson(database, "flags", flags);
  }

  const plans = readJson<Plan[]>(database, "plans");
  if (plans) {
    let changed = false;
    if (!plans.some((plan) => plan.custom)) {
      const custom = defaultPlans.find((plan) => plan.custom);
      if (custom) plans.push(custom);
      changed = true;
    }
    plans.forEach((plan) => {
      if (plan.custom == null) plan.custom = false;
      if (plan.priceLabel == null) plan.priceLabel = plan.custom ? "Custom" : "";
      if (plan.includedMinutes == null) {
        const seeded = defaultPlans.find((item) => item.name === plan.name);
        plan.includedMinutes = seeded ? seeded.includedMinutes : plan.custom ? 0 : 200;
      }
      if (plan.carrierCredit == null) {
        const seeded = defaultPlans.find((item) => item.name === plan.name);
        plan.carrierCredit = seeded ? seeded.carrierCredit : 0;
        changed = true;
      }
      if (plan.note === "AI receptionist available as add-on" || plan.note === "Base plan. Any-language AI starts on the plans above.") {
        plan.note = "A single person, without the AI receptionist.";
        changed = true;
      }
    });
    for (const plan of plans) {
      if (!plan.custom && (plan.ctaHref === "/contact" || plan.ctaHref === "/how-it-works" || plan.ctaLabel === "Request this plan")) {
        plan.ctaLabel = "Create account";
        plan.ctaHref = `/account/register?plan=${encodeURIComponent(plan.name)}`;
        changed = true;
      }
    }
    const normalized = normalizePlans(plans);
    if (JSON.stringify(normalized) !== JSON.stringify(plans)) changed = true;
    if (changed) writeJson(database, "plans", normalized);
  }

  for (const [key, value] of Object.entries(defaultPages)) {
    const page = readJson<Record<string, unknown>>(database, `page.${key}`);
    if (!page) continue;
    let pageChanged = mergeMissing(page, value);
    const replacements: Record<string, string> = {
      "On every plan except the base plan, the AI receptionist can receive a call and understand the person speaking, whichever language they use.": "Any-language understanding is included only on plans where an administrator has checked that feature.",
      "Solo is the base plan, so any-language understanding is not included there. It is included on Small Business, Team, and Custom.": "A plan without the AI receptionist checked does not include AI. Any-language understanding is a separate check.",
      "The AI receptionist can receive the call and follow what the caller is saying in any language. That is included on every plan except the base plan.": "The AI receptionist follows what the caller is saying in any language when that feature is checked on the customer's plan.",
      "The base plan is Solo. Small Business, Team, and Custom include any-language call understanding.": "Plans that do not have the AI receptionist checked do not include AI.",
      "Try describing a sample setup in the interactive box. This prototype will show a sample interpretation; it does not connect to a live AI or PBX.": "Describe the phone system you need. The assistant matches it to a real plan, then you create an account and subscribe.",
      "Here's a sample interpretation": "Your plan",
      "Preview only. A real system would ask follow-up questions, validate pricing and carrier availability, then request your approval before provisioning.": "Create an account on this plan to subscribe.",
      "Try a sample request": "Matches your description to a plan you can subscribe to",
      "Design my phone system": "Create account",
      "Build my system": "Create account",
      "Preview": "Ready",
      "See the setup experience": "Describe your setup",
      "Transparent-looking plans. Human-sized businesses.": "Plans you can subscribe to.",
      "Explore concept packages for SautiCall. Plans, allowances, and final prices will be finalized after provider licensing and operating costs are confirmed.": "Choose a plan and create the account. The monthly price is the price on the plan.",
      "Build a sample estimate.": "Choose a plan to set up.",
      "This is a design-demo estimator, not a checkout or binding quote.": "Pick a plan here. The button opens account setup for that plan.",
      "Illustrative SautiCall plans for solo operators, small businesses, and teams.": "Choose Solo, Small Business, or Team and create the account.",
      "Start with your idea": "Create account",
      "Ask about pricing": "Create an account",
      "EXPLORE YOUR SETUP": "SET UP A PLAN",
    };
    const signupFields = ["headerCtaHref", "primaryHref", "endHref", "estimateHref"];
    for (const [from, to] of Object.entries(replacements)) {
      for (const [field, current] of Object.entries(page)) {
        if (current === from) {
          page[field] = to;
          pageChanged = true;
        }
      }
    }
    if (key !== "custom" && key !== "account") {
      for (const field of signupFields) {
        if (page[field] === "/how-it-works" || page[field] === "/contact") {
          page[field] = "/account/register";
          pageChanged = true;
        }
      }
    }
    if (key === "account") {
      if (page.primaryHref === "/how-it-works") {
        page.primaryHref = "/account/billing";
        page.primaryCta = "Choose a plan";
        pageChanged = true;
      }
      if (page.secondaryHref === "/contact") {
        page.secondaryHref = "/account/phone";
        page.secondaryCta = "Phone system";
        pageChanged = true;
      }
    }
    if (pageChanged) writeJson(database, `page.${key}`, page);
  }

  const ai = readJson<Record<string, unknown>>(database, "page.ai");
  if (ai && Array.isArray(ai.points)) {
    const oldPoint = "Understands callers in any language on every plan except the base plan";
    const nextPoint = "Understands callers in any language only on plans where that feature is checked";
    const index = ai.points.indexOf(oldPoint);
    if (index >= 0) ai.points[index] = nextPoint;
    else if (!ai.points.includes(nextPoint)) ai.points.splice(1, 0, nextPoint);
    else ai.points = null;
    if (ai.points) writeJson(database, "page.ai", ai);
  }

  const contact = readJson<Record<string, unknown>>(database, "page.contact");
  if (contact && Array.isArray(contact.services) && !contact.services.includes("A custom phone system")) {
    const unsure = contact.services.indexOf("Not sure yet");
    if (unsure >= 0) contact.services.splice(unsure, 0, "A custom phone system");
    else contact.services.push("A custom phone system");
    writeJson(database, "page.contact", contact);
  }

  const faqs = readJson<Faq[]>(database, "faqs");
  const extraFaqs: Faq[] = [
    { q: "Can the AI understand a caller in any language?", a: "Only on a plan where an administrator has checked AI in any language. A plan without the AI receptionist checked does not include AI at all." },
    { q: "What if none of the priced plans fit?", a: "Choose Custom. There is no public price. Describe the system you need and leave your contact details. A salesperson will reach out." },
    { q: "How do call minutes work?", a: "Each priced plan includes outbound minutes for 30 days after you pay. You can also buy minute bundles, and those minutes last until you use them. When the balance reaches zero, outbound calls stop at the phone company. An administrator sets the included minutes and the bundle prices." },
  ];
  if (faqs) {
    let changed = false;
    for (const faq of extraFaqs) {
      if (!faqs.some((item) => item.q === faq.q)) {
        faqs.push(faq);
        changed = true;
      }
    }
    for (const faq of faqs) {
      if (faq.q === "Is this a real subscription offer?" && faq.a.startsWith("This website is a design prototype")) {
        faq.a = "Yes. In your account, choose a plan and pay with a method an administrator has connected. The charge is that plan’s monthly price.";
        changed = true;
      }
      if (faq.q === "Can the AI understand a caller in any language?" && faq.a.includes("base plan")) {
        faq.a = "Only on a plan where an administrator has checked AI in any language. A plan without the AI receptionist checked does not include AI at all.";
        changed = true;
      }
    }
    if (changed) writeJson(database, "faqs", faqs);
  }

  const personas = readJson<Persona[]>(database, "personas");
  const customPersona = defaultPersonas.find((persona) => persona.href === "/custom");
  if (personas && customPersona && !personas.some((persona) => persona.href === "/custom")) {
    personas.push(customPersona);
    writeJson(database, "personas", personas);
  }
  if (personas) {
    let personaChanged = false;
    for (const persona of personas) {
      const title = persona.title.toLowerCase();
      const route = title.includes("just you") ? ["/account/register?plan=Solo", "Set up Solo"]
        : title.includes("small") ? ["/account/register?plan=Small%20Business", "Set up Small Business"]
        : title.includes("pouring") ? ["/account/register?plan=Team", "Set up Team"]
        : null;
      if (route && (persona.href !== route[0] || persona.cta !== route[1])) {
        persona.href = route[0];
        persona.cta = route[1];
        personaChanged = true;
      }
    }
    if (personaChanged) writeJson(database, "personas", personas);
  }

  const footer = readJson<{ legalRight?: string; groups: { title: string; links: { label: string; href: string }[] }[] }>(database, "footer");
  if (footer?.legalRight === "Preview only · No purchases or phone provisioning occur here.") {
    footer.legalRight = "Payments and phone orders run only after an administrator connects them.";
    writeJson(database, "footer", footer);
  }
  const account = readJson<Record<string, unknown>>(database, "page.account");
  if (account) {
    const replacements: Record<string, string> = {
      "Request a new business number. Live inventory is connected in a later provisioning step; the request is saved now.":
        "Search available business numbers when live search is on. A request is saved either way, and an administrator places the carrier order.",
      "Start a transfer request. Carrier submission runs when the VoIP.ms connection is enabled; until then the request waits for the team.":
        "Tell us the number and the details on your current carrier bill. Live submission runs only when an administrator has enabled it.",
      "Search available business numbers when live search is on. A request is saved either way, and an administrator places the carrier order.":
        "Search available business numbers when live search is on. Add the address where emergency services should find you. It is sent to the phone company when the number is bought.",
      "Search available business numbers when live search is on. Add the address where emergency services should find you. It is sent to the phone company when the number is bought.":
        "Search the phone company inventory and request one of the numbers listed. Add the address where emergency services should find you. It is sent to the phone company when the number is bought.",
      "Live inventory search is off. Describe the number you want and the team will handle it.":
        "Number search is not available right now.",
      "Number inventory search is not available until VoIP.ms is connected.":
        "Number search is not available right now.",
      "Email for the 3CX apps":
        "Email for the phone apps",
    };
    let changed = false;
    for (const [from, to] of Object.entries(replacements)) {
      if (account[from] === undefined && Object.entries(account).some(([, value]) => value === from)) {
        for (const [key, value] of Object.entries(account)) {
          if (value === from) {
            account[key] = to;
            changed = true;
          }
        }
      }
    }
    const oldPhone = "Add the people who should have an extension. During the day calls go to the first person. After hours they go to voicemail.";
    if (account.phoneBody === oldPhone) {
      account.phoneBody = "Add people, then make a ring group or a call queue. Daytime calls go to the group you choose. After hours they go to voicemail. Until a group is on the phone system, daytime calls go to the first person.";
      changed = true;
    }
    if (account.numbersRateLabel === "Rate center") {
      account.numbersRateLabel = "City";
      changed = true;
    }
    if (account.numbersStateLabel === "State or province code") {
      account.numbersStateLabel = "State or province";
      changed = true;
    }
    const oldNumbers = "Search the phone company inventory and request one of the numbers listed. Add the address where emergency services should find you. It is sent to the phone company when the number is bought.";
    if (account.numbersBody === oldNumbers) {
      account.numbersBody = "Search the phone company inventory by city, by a full number, or by how the number starts or ends. Add the address where emergency services should find you. It is sent to the phone company when the number is bought.";
      changed = true;
    }
    if (mergeMissing(account, {
      registerBusiness: "Business name",
      registerBusinessHint: "Used as your company name",
      numbersBuy: "Buy this number",
      numbersOrdered: "This number was bought from the phone company.",
      numbersHeld: "The request is saved. Buying is turned off, so it waits until live number ordering is on.",
      numbersModeLabel: "Search by",
      numbersQueryNumber: "Number",
      numbersQueryPrefix: "Starts with",
      numbersQuerySuffix: "Ends with",
    })) changed = true;
    if (changed) writeJson(database, "page.account", account);
  }

  const ensureNav = (link: NavLink) => {
    const nav = readJson<NavLink[]>(database, "nav");
    if (nav && !nav.some((item) => item.href === link.href && item.location === link.location)) {
      nav.push(link);
      writeJson(database, "nav", nav);
    }
  };
  ensureNav({ label: "Phone system", href: "/account/phone", location: "account" });
  ensureNav({ label: "Call minutes", href: "/account/minutes", location: "account" });
  ensureNav({ label: "Support", href: "/account/tickets", location: "account" });
  ensureNav({ label: "FAQ", href: "/faq", location: "header" });
  ensureNav({ label: "FAQ", href: "/faq", location: "mobile" });

  const disclaimers = [
    "*Illustrative concept prices only. Not live plans or a purchase offer. Custom has no public price. Minutes, DIDs, 3CX licenses, telecom charges, taxes, E911 and AI usage require final commercial validation.",
    "*Illustrative concept prices only. Not live plans or a purchase offer. The Custom plan has no public price. Minutes, DIDs, 3CX licenses, telecom charges, taxes, E911 and AI usage require final commercial validation. Plans, prices, and which plans include any-language AI are managed from the admin portal.",
  ];
  const nextDisclaimer = "*Monthly price includes the outbound minutes set on that plan. Extra minutes can be bought as bundles and last until they are used. Custom has no public price. Taxes, number fees, and emergency calling are separate.";
  for (const key of ["page.home", "page.pricing"]) {
    const page = readJson<Record<string, unknown>>(database, key);
    if (page && disclaimers.includes(String(page.disclaimer || ""))) {
      page.disclaimer = nextDisclaimer;
      writeJson(database, key, page);
    }
  }

  const explore = footer?.groups.find((group) => group.title === "Explore");
  if (explore && !explore.links.some((link) => link.href === "/custom")) {
    explore.links.push({ label: "Custom plan", href: "/custom" });
    writeJson(database, "footer", footer);
  }
  const withFaq = readJson<{ groups: { title: string; links: { label: string; href: string }[] }[] }>(database, "footer");
  const faqExplore = withFaq?.groups.find((group) => group.title === "Explore");
  if (faqExplore && !faqExplore.links.some((link) => link.href === "/faq")) {
    faqExplore.links.push({ label: "FAQ", href: "/faq" });
    writeJson(database, "footer", withFaq);
  }

  const approvedCopy: Record<string, Record<string, string>> = {
    "page.home": {
      "A better way to": "Your business phone system.",
      "say hello.": "Your AI receptionist. One place.",
      "SAY HELLO TO BETTER BUSINESS CALLING": "BUSINESS CALLING, CONNECTED",
      "One smart home for your business number, office phones, team extensions, and an AI receptionist that never forgets to pick up.": "Bring your business number, team extensions, desk phones and AI call handling together with SautiCall.",
      "Plans you can subscribe to.": "A plan for the way you work.",
      "Create an account on a priced plan, then pay. Custom has no public price: tell us what you need and a salesperson will reach out.": "Compare team size, included outbound minutes, and the features your business needs.",
      "Your business deserves a great hello.": "Make your next hello a better one.",
      "Bring the phone system you need to life, with the support of an AI setup assistant and a real team behind it.": "Bring your numbers, team, and call handling together.",
    },
    "page.solutions": {
      "THE FULL TOOLKIT": "SOLUTIONS",
      "One platform.": "The right tools for",
      "So many ways to connect.": "every business call.",
      "Everything from your first business number to a small contact center, managed in one SautiCall account.": "Connect your numbers, team and call handling in one SautiCall account.",
    },
    "page.ai": {
      "SAUTICALL AI RECEPTIONIST": "AI RECEPTIONIST",
      "A great first impression.": "A warm welcome.",
      "Every single call.": "A clear next step.",
      "Your AI receptionist can greet callers, answer approved questions, take messages, and help people reach the right person—even when your hands are full.": "Greet callers, answer approved business questions, take messages and connect people to your team.",
    },
    "page.pricing": {
      "SIMPLE PLANS": "PLANS & PRICING",
      "Start small.": "Choose the right fit",
      "Sound big.": "for your business calls.",
      "Choose a plan and create the account. The monthly price is the price on the plan.": "Compare team capacity, outbound minutes and the features your business needs.",
      "Choose Solo, Small Business, or Team and create the account.": "Compare Solo, Small Business, and Team. Prices, minutes, and features are the plans you can subscribe to.",
      "Questions? We have answers.": "Frequently asked questions.",
      "Make every call count.": "Let's find the right plan for your team.",
    },
  };
  for (const [key, replacements] of Object.entries(approvedCopy)) {
    const page = readJson<Record<string, unknown>>(database, key);
    if (!page) continue;
    let changed = false;
    for (const [field, value] of Object.entries(page)) {
      if (typeof value === "string" && replacements[value]) {
        page[field] = replacements[value];
        changed = true;
      }
    }
    if (key === "page.home") {
      if (page.primaryCta === "Create account" && page.primaryHref === "/account/register") {
        page.primaryCta = "View plans";
        page.primaryHref = "/pricing";
        page.secondaryCta = "Talk to us";
        page.secondaryHref = "/contact";
        changed = true;
      }
    }
    if (changed) writeJson(database, key, page);
  }
  const navItems = readJson<NavLink[]>(database, "nav");
  if (navItems) {
    let navChanged = false;
    for (const item of navItems) {
      if (item.href === "/faq" && item.label === "FAQ" && (item.location === "header" || item.location === "mobile")) {
        item.label = "Help";
        navChanged = true;
      }
      if (item.href === "/ai-receptionist" && item.label === "AI Receptionist") {
        item.label = "AI receptionist";
        navChanged = true;
      }
    }
    if (navChanged) writeJson(database, "nav", navItems);
  }
  const footerCopy = readJson<{ blurb?: string; mini?: string; legalLeft?: string; legalRight?: string; groups: { title: string; links: { label: string; href: string }[] }[] }>(database, "footer");
  if (footerCopy) {
    let footerChanged = false;
    if (footerCopy.blurb === "Business calls, your way. One approachable platform for modern phone systems and intelligent call handling.") {
      footerCopy.blurb = "Business calls, connected.";
      footerChanged = true;
    }
    if (typeof footerCopy.legalLeft === "string" && footerCopy.legalLeft.includes("design concept")) {
      footerCopy.legalLeft = "© 2026 SautiCall. All rights reserved.";
      footerChanged = true;
    }
    const footerShape = footerCopy.groups.map((group) => group.title).join("|");
    if (footerShape === "Explore|Company|Platform" || footerShape === "Solutions|Support|Company") {
      footerCopy.groups = [
        { title: "Solutions", links: [
          { label: "Business numbers", href: "/solutions#numbers" },
          { label: "Team extensions", href: "/solutions#phone" },
          { label: "AI receptionist", href: "/ai-receptionist" },
          { label: "How it works", href: "/how-it-works" },
          { label: "Pricing", href: "/pricing" },
        ] },
        { title: "Company", links: [
          { label: "About us", href: "/about" },
          { label: "Contact", href: "/contact" },
        ] },
        { title: "Support", links: [
          { label: "Help centre", href: "/faq" },
          { label: "Contact support", href: "/contact" },
        ] },
      ];
      footerCopy.mini = "";
      if (footerCopy.legalRight === "Payments and phone orders run only after an administrator connects them.") footerCopy.legalRight = "";
      footerChanged = true;
    }
    if (footerChanged) writeJson(database, "footer", footerCopy);
  }

  for (const [key, extras] of Object.entries(liveCopy)) {
    if (key === "page.help") {
      const help = readJson<Record<string, unknown>>(database, key);
      if (!help) {
        database.prepare("INSERT INTO documents (key, json, updated_at) VALUES (?, ?, ?)").run(key, JSON.stringify(extras), new Date().toISOString());
      } else if (mergeMissingDeep(help, extras)) writeJson(database, key, help);
      continue;
    }
    const page = readJson<Record<string, unknown>>(database, key);
    if (!page) continue;
    let changed = mergeMissingDeep(page, extras);
    if (key === "page.home" && page.headerCta === "Create account" && page.headerCtaHref === "/account/register") {
      page.headerCta = "Get started";
      changed = true;
    }
    if (changed) writeJson(database, key, page);
  }
  for (const link of solutionsMenu) {
    const nav = readJson<NavLink[]>(database, "nav");
    if (nav && !nav.some((item) => item.href === link.href && item.location === link.location)) {
      nav.push(link);
      writeJson(database, "nav", nav);
    }
  }

  for (const key of ["page.home", "page.solutions", "page.ai", "page.how", "page.about", "page.pricing", "page.contact", "page.custom", "page.account", "page.help", "services", "faqs"]) {
    const current = readJson<unknown>(database, key);
    if (!current) continue;
    const cleaned = scrubCustomerValue(current);
    if (cleaned.changed) writeJson(database, key, cleaned.value);
  }
  const faqCols = new Set((database.prepare("PRAGMA table_info(faq_posts)").all() as { name: string }[]).map((column) => column.name));
  if (faqCols.has("body")) {
    const posts = database.prepare("SELECT id, title, excerpt, body FROM faq_posts").all() as { id: number; title: string; excerpt: string; body: string }[];
    for (const post of posts) {
      const title = cleanCustomerString(post.title);
      const excerpt = cleanCustomerString(post.excerpt);
      const body = cleanCustomerString(post.body);
      if (title !== post.title || excerpt !== post.excerpt || body !== post.body) {
        database.prepare("UPDATE faq_posts SET title = ?, excerpt = ?, body = ? WHERE id = ?").run(title, excerpt, body, post.id);
      }
    }
  }
}

function cleanCustomerString(text: string) {
  const known: Record<string, string> = {
    "Connect supported office IP phones, or call from the familiar 3CX desktop, browser, and mobile apps. Mix devices to fit your team.": "Connect supported office IP phones, or call from desktop, browser, and mobile apps. Mix devices to fit your team.",
    "Employees can use compatible IP desk phones in the office or 3CX apps on their computers and smartphones. Calls stay associated with your business phone setup, not a personal device number.": "Employees can use compatible IP desk phones in the office or phone apps on their computers and smartphones. Calls stay associated with your business phone setup, not a personal device number.",
    "Search and request available VoIP.ms numbers. SautiCall connects the acquired number to the appropriate inbound and outbound 3CX trunk configuration after validating capacity and authorization.": "Search for an available business number. When direct buying is on, it is bought right away and connected for inbound and outbound calls.",
    "Search for an available business number. SautiCall connects it for inbound and outbound calls after the request is approved.": "Search for an available business number. When direct buying is on, it is bought right away and connected for inbound and outbound calls.",
    "Start a transfer in your dashboard, upload your authorization and carrier details, and follow every state. VoIP.ms is the primary porting route when its API supports the case, with staff intervention for exceptions.": "Start a transfer in your account, add the details from your current phone bill, and follow each step. The team steps in when a transfer needs a person.",
    "AI handling is configured from your SautiCall account, within supported 3CX capabilities and approved access permissions.": "AI handling is configured from your SautiCall account, with the permissions an administrator has approved.",
    "Supported 3CX users, departments, extensions, and route configuration via APIs.": "People, departments, extensions, and call routing are set up for you.",
    "DID requests and number ports progress through defined statuses in your account.": "Number requests and transfers move through clear statuses in your account.",
    "The proposed service combines SautiCall software with a SautiCall-managed 3CX cloud environment and VoIP.ms number acquisition and porting workflows. These providers remain infrastructure—not separate products customers have to manage.": "SautiCall brings calling, business numbers, and number transfers into one account. You do not manage the providers behind it.",
    "3CX-based calling, supported devices, extensions and call routing.": "Calling, supported devices, extensions, and call routing.",
    "New numbers and port requests via VoIP.ms, with tracked manual exceptions.": "New numbers and number transfers, with a person available when a request needs one.",
    "Number inventory search is not available until VoIP.ms is connected.": "Number search is not available right now.",
    "Email for the 3CX apps": "Email for the phone apps",
  };
  if (known[text]) return known[text];
  if (!/3CX|VoIP\.ms/.test(text)) return text;
  return text.replace(/3CX apps/g, "phone apps").replace(/VoIP\.ms/g, "the phone company").replace(/3CX/g, "the phone system");
}

function scrubCustomerValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const next = cleanCustomerString(value);
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = scrubCustomerValue(item);
      changed = changed || result.changed;
      return result.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = scrubCustomerValue(item);
      next[key] = result.value;
      changed = changed || result.changed;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}
