import { readDoc } from "./db";
import type { Faq, Flag, NavLink, Persona, Plan, Service, Theme } from "./types";

export function loadSite() {
  return {
    theme: readDoc<Theme>("theme"),
    flags: readDoc<Flag[]>("flags"),
    nav: readDoc<NavLink[]>("nav"),
    footer: readDoc<{
      blurb: string;
      mini: string;
      groups: { title: string; links: { label: string; href: string }[] }[];
      legalLeft: string;
      legalRight: string;
    }>("footer"),
    services: readDoc<Service[]>("services"),
    plans: readDoc<Plan[]>("plans"),
    faqs: readDoc<Faq[]>("faqs"),
    personas: readDoc<Persona[]>("personas"),
    home: readDoc<Record<string, unknown>>("page.home"),
    solutions: readDoc<Record<string, unknown>>("page.solutions"),
    ai: readDoc<Record<string, unknown>>("page.ai"),
    how: readDoc<Record<string, unknown>>("page.how"),
    pricing: readDoc<Record<string, unknown>>("page.pricing"),
    about: readDoc<Record<string, unknown>>("page.about"),
    contact: readDoc<Record<string, unknown>>("page.contact"),
    custom: readDoc<Record<string, unknown>>("page.custom"),
    account: readDoc<Record<string, unknown>>("page.account"),
    help: readDoc<Record<string, unknown>>("page.help"),
  };
}

export function pageMetadata(page: Record<string, unknown>) {
  const title = typeof page.metaTitle === "string" ? page.metaTitle : undefined;
  const description = typeof page.metaDescription === "string" ? page.metaDescription : undefined;
  return { title, description };
}

export function enabled(flags: Flag[], key: string) {
  return flags.find((flag) => flag.key === key)?.enabled === true;
}
