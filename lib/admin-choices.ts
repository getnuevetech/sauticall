import { iconNames } from "@/components/Icon";
import { defaultFlags } from "@/lib/seed-data";

export type Choice = { value: string; label: string };

export const pageChoices: Choice[] = [
  { value: "/", label: "Home" },
  { value: "/solutions", label: "Solutions" },
  { value: "/solutions#phones", label: "Solutions · phones" },
  { value: "/solutions#numbers", label: "Solutions · numbers" },
  { value: "/solutions#porting", label: "Solutions · porting" },
  { value: "/ai-receptionist", label: "AI receptionist" },
  { value: "/how-it-works", label: "How it works" },
  { value: "/pricing", label: "Pricing" },
  { value: "/about", label: "About" },
  { value: "/contact", label: "Contact" },
  { value: "/custom", label: "Custom plan" },
  { value: "/account", label: "Account home" },
  { value: "/account/login", label: "Sign in" },
  { value: "/account/register", label: "Create account" },
  { value: "/account/billing", label: "Billing" },
  { value: "/account/numbers", label: "Numbers" },
  { value: "/account/porting", label: "Number transfer" },
  { value: "/account/security", label: "Security" },
];

export const locationChoices: Choice[] = [
  { value: "header", label: "Header" },
  { value: "mobile", label: "Mobile menu" },
  { value: "footer", label: "Footer" },
  { value: "account", label: "Account menu" },
];

export const iconChoices: Choice[] = iconNames.map((name) => ({ value: name, label: name }));

export const cardColorChoices: Choice[] = [
  { value: "#eef3fa", label: "Soft blue" },
  { value: "#fff0eb", label: "Soft coral" },
  { value: "#dce2fb", label: "Soft violet" },
];

export const currencyChoices: Choice[] = [
  { value: "USD", label: "USD" },
  { value: "CAD", label: "CAD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
];

export const providerChoices: Choice[] = [
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "square", label: "Square" },
];

export const dialTimeChoices: Choice[] = ["15", "30", "45", "60", "90", "120"].map((value) => ({ value, label: `${value} seconds` }));

export const flagKeyChoices: Choice[] = defaultFlags.map((flag) => ({ value: flag.key, label: flag.label }));

export function withCurrent(options: Choice[], current: string) {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: `${current} (saved)` }];
}

export function choicesFor(docKey: string, name: string): Choice[] | null {
  if (name === "href" || name.endsWith("Href")) return pageChoices;
  if (name === "location") return locationChoices;
  if (name === "icon") return iconChoices;
  if (name === "cardColor") return cardColorChoices;
  if (docKey === "flags" && name === "key") return flagKeyChoices;
  return null;
}
