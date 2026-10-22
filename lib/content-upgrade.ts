import type Database from "better-sqlite3";
import { anyLanguageFeature, defaultFlags, defaultPages, defaultPersonas, defaultPlans } from "./seed-data";
import type { Faq, Flag, Persona, Plan } from "./types";

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
  ];
  if (faqs) {
    let changed = false;
    for (const faq of extraFaqs) {
      if (!faqs.some((item) => item.q === faq.q)) {
        faqs.push(faq);
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

  const footer = readJson<{ groups: { title: string; links: { label: string; href: string }[] }[] }>(database, "footer");
  const explore = footer?.groups.find((group) => group.title === "Explore");
  if (explore && !explore.links.some((link) => link.href === "/custom")) {
    explore.links.push({ label: "Custom plan", href: "/custom" });
    writeJson(database, "footer", footer);
  }
}
