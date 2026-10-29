import { featureLabel, PLAN_FEATURES } from "./plan-features.ts";
import type { Plan } from "./types";

export type BundleOffer = { name: string; minutes: number; price: number; enabled: boolean };
export type CatalogChange = { label: string; from: string; to: string };

export function configuredCurrency(lists: string[]) {
  const codes = [...new Set(lists.flatMap((list) => list.split(",").map((part) => part.trim().toUpperCase()).filter((part) => /^[A-Z]{3}$/.test(part))))];
  return { code: codes[0] || "USD", choices: codes.length > 1 ? codes : [] };
}

export function catalogMoney(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export function pricePerMinute(price: number, minutes: number, currency: string) {
  if (!(minutes > 0) || price < 0) return "";
  const rate = price / minutes;
  try {
    return `${new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate)} / min`;
  } catch {
    return `${currency} ${rate.toFixed(2)} / min`;
  }
}

function onOff(value: boolean) {
  return value ? "On" : "Off";
}

export function planChanges(before: Plan | null, after: Plan): CatalogChange[] {
  if (!before) return [{ label: "Plan", from: "Not saved", to: after.name.trim() || "New plan" }];
  const changes: CatalogChange[] = [];
  const push = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to });
  };
  push("Name", before.name, after.name);
  push("Monthly price", before.custom ? "Custom" : String(before.price), after.custom ? "Custom" : String(after.price));
  push("Extensions", String(before.seats ?? ""), String(after.seats ?? ""));
  push("Outbound minutes", String(before.includedMinutes), String(after.includedMinutes));
  push("Provider funding", String(before.carrierCredit || 0), String(after.carrierCredit || 0));
  push("Popular plan", onOff(before.popular), onOff(after.popular));
  push("Custom quote", onOff(before.custom), onOff(after.custom));
  push("Description", before.desc, after.desc);
  push("Pricing note", before.note, after.note);
  push("Button label", before.ctaLabel, after.ctaLabel);
  push("Button link", before.ctaHref, after.ctaHref);
  for (const feature of PLAN_FEATURES) {
    const was = before.features.includes(feature.key);
    const now = after.features.includes(feature.key);
    if (was !== now) changes.push({ label: feature.label, from: onOff(was), to: onOff(now) });
  }
  return changes;
}

export function planImpact(input: { before: Plan | null; after: Plan; subscribers: number; fundEnabled: boolean }) {
  const { before, after, subscribers, fundEnabled } = input;
  const lines: string[] = [];
  const people = subscribers === 1 ? "1 customer who already paid" : `${subscribers} customers who already paid`;
  if (!before) {
    lines.push("This adds a plan to the catalog. Saving does not charge anyone or create phone service.");
    lines.push("A customer receives these limits and features only after a payment for this plan is confirmed.");
    lines.push("This save does not fund a provider account or provision phone service.");
    return lines;
  }
  if (before.name !== after.name) {
    lines.push(subscribers
      ? `${people} for “${before.name}” stay recorded on that name. After a rename, their extension allowance and features no longer follow this plan. Purchase records are not rewritten.`
      : "No paid customer is matched to the current name. Purchase records are not rewritten.");
  }
  if (!before.custom && after.custom) {
    lines.push("A custom quote has no public price and is not used as a paid plan. Customers matched to this name stop receiving its extension allowance and features.");
  }
  if (!after.custom && before.price !== after.price) {
    lines.push(`New checkouts charge ${after.price}. This save does not bill customers who already paid.`);
  }
  if ((before.seats ?? 0) !== (after.seats ?? 0)) {
    lines.push(`Customers on this plan can add people up to ${after.seats ?? 0} extensions. People already added stay. A department already on the phone system keeps its reserved numbers. This save does not create or remove phone service.`);
  }
  if (before.includedMinutes !== after.includedMinutes) {
    lines.push(`The next confirmed payment grants ${after.includedMinutes} outbound minutes for 30 days. Minutes already credited stay until they expire or are used.`);
  }
  const added = after.features.filter((key) => !before.features.includes(key));
  const removed = before.features.filter((key) => !after.features.includes(key));
  if (added.length) lines.push(`Turning on ${added.map((key) => featureLabel(key)).join(", ")} lets customers on this plan use ${added.length === 1 ? "it" : "them"}. Enabling an entitlement does not provision the phone system.`);
  if (removed.length) lines.push(`Turning off ${removed.map((key) => featureLabel(key)).join(", ")} removes ${removed.length === 1 ? "that entitlement" : "those entitlements"} for customers on this plan. Phone records already created are kept.`);
  if ((before.carrierCredit || 0) !== (after.carrierCredit || 0)) {
    lines.push(fundEnabled
      ? `The next confirmed payment can add ${after.carrierCredit || 0} to the phone-company account, and only if that customer has not already been funded. This save does not add or remove provider funds.`
      : "Funding client accounts is turned off, so this amount is stored and is not sent to the phone company.");
  }
  if (before.popular !== after.popular || before.desc !== after.desc || before.note !== after.note || before.ctaLabel !== after.ctaLabel || before.ctaHref !== after.ctaHref) {
    lines.push("The public pricing page updates when this is saved. The popular mark, description, note, and button do not change entitlements.");
  }
  if (subscribers === 0 && before.name === after.name) lines.push("No paid customer is on this plan yet.");
  lines.push("This save does not fund a provider account or provision phone service.");
  return lines;
}

export function normalizeBundle(row: Partial<BundleOffer> | null | undefined): BundleOffer {
  return {
    name: String(row?.name || "").trim(),
    minutes: Math.max(0, Math.round(Number(row?.minutes) || 0)),
    price: Math.max(0, Math.round((Number(row?.price) || 0) * 100) / 100),
    enabled: row?.enabled !== false,
  };
}

export function applyBundleEdits(existing: BundleOffer[], incoming: Partial<BundleOffer>[]) {
  const next = incoming.map((row) => normalizeBundle(row));
  if (next.length < existing.length) return { ok: false as const, message: "A bundle can be hidden from new purchases. Its record stays, and purchase history is kept." };
  if (next.some((row) => !row.name) || new Set(next.map((row) => row.name.toLowerCase())).size !== next.length) {
    return { ok: false as const, message: "Give every bundle its own name." };
  }
  const invalid = next.find((row) => row.enabled && (row.minutes <= 0 || row.price <= 0));
  if (invalid) return { ok: false as const, message: `${invalid.name} needs minutes and a price while customers can buy it.` };
  return { ok: true as const, bundles: next };
}

export function bundleImpact(input: { before: BundleOffer | null; after: BundleOffer; purchases: number }) {
  const { before, after, purchases } = input;
  const lines: string[] = [];
  if (!before) {
    lines.push("This adds a bundle customers can buy. Saving does not credit anyone.");
    lines.push("Minutes are credited only after a payment is confirmed, and they remain until they are used.");
    return lines;
  }
  if (before.name !== after.name) lines.push("Confirmed purchases keep the previous bundle name. This save does not rewrite purchase history.");
  if (before.minutes !== after.minutes || before.price !== after.price) {
    lines.push("New purchases use the saved minutes and price. Minute balances already credited stay until they are used.");
  }
  if (before.enabled && !after.enabled) {
    lines.push(purchases
      ? `This hides the bundle from new purchases. ${purchases} confirmed ${purchases === 1 ? "purchase" : "purchases"} and those minute balances stay. The record is not deleted.`
      : "This hides the bundle from new purchases. The record is not deleted.");
  }
  if (!before.enabled && after.enabled) lines.push("Customers can buy this bundle again. Existing balances stay until they are used.");
  lines.push("Saving does not add or remove customer minute balances.");
  return lines;
}
