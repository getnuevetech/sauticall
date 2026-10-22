import type Database from "better-sqlite3";
import { anyLanguageFeature, defaultFlags, defaultPages, defaultPersonas, defaultPlans } from "./seed-data";
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
    const baseIndex = plans.findIndex((plan) => !plan.custom);
    plans.forEach((plan, index) => {
      if (plan.custom == null) {
        plan.custom = false;
        changed = true;
      }
      if (plan.base == null) {
        plan.base = !plan.custom && index === baseIndex;
        changed = true;
      }
      if (plan.multilingual == null) {
        plan.multilingual = !plan.base;
        changed = true;
      }
      if (plan.priceLabel == null) {
        plan.priceLabel = plan.custom ? "Custom" : "";
        changed = true;
      }
      if (plan.multilingual && !plan.features.includes(anyLanguageFeature)) {
        plan.features.push(anyLanguageFeature);
        changed = true;
      }
      if (plan.base && plan.note === "AI receptionist available as add-on") {
        plan.note = "Base plan. Any-language AI starts on the plans above.";
        changed = true;
      }
      if (plan.includedMinutes == null) {
        const seeded = defaultPlans.find((item) => item.name === plan.name);
        plan.includedMinutes = seeded ? seeded.includedMinutes : plan.custom ? 0 : 200;
        changed = true;
      }
    });
    if (changed) writeJson(database, "plans", plans);
  }

  for (const [key, value] of Object.entries(defaultPages)) {
    const page = readJson<Record<string, unknown>>(database, `page.${key}`);
    if (page && mergeMissing(page, value)) writeJson(database, `page.${key}`, page);
  }

  const ai = readJson<Record<string, unknown>>(database, "page.ai");
  if (ai && Array.isArray(ai.points) && ai.points.every((point) => point !== "Understands callers in any language on every plan except the base plan")) {
    ai.points.splice(1, 0, "Understands callers in any language on every plan except the base plan");
    writeJson(database, "page.ai", ai);
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
    { q: "Can the AI understand a caller in any language?", a: "Yes, on every plan except the base plan. The AI receptionist can receive the call and understand the caller in the language they speak. The Solo plan is the base plan and does not include this." },
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
    }
    if (changed) writeJson(database, "faqs", faqs);
  }

  const personas = readJson<Persona[]>(database, "personas");
  const customPersona = defaultPersonas.find((persona) => persona.href === "/custom");
  if (personas && customPersona && !personas.some((persona) => persona.href === "/custom")) {
    personas.push(customPersona);
    writeJson(database, "personas", personas);
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
    if (changed) writeJson(database, "page.account", account);
  }

  const nav = readJson<NavLink[]>(database, "nav");
  if (nav && !nav.some((link) => link.href === "/account/phone")) {
    nav.push({ label: "Phone system", href: "/account/phone", location: "account" });
    writeJson(database, "nav", nav);
  }
  const withPhone = readJson<NavLink[]>(database, "nav");
  if (withPhone && !withPhone.some((link) => link.href === "/account/minutes")) {
    withPhone.push({ label: "Call minutes", href: "/account/minutes", location: "account" });
    writeJson(database, "nav", withPhone);
  }

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
}
