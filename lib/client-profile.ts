export type ClientPlace = {
  address: string;
  city: string;
  state: string;
  country: "US" | "CA";
  zip: string;
  phone: string;
};

const US_PLACE = { address: "100 Main Street", city: "Houston", state: "TX", zip: "77002", phone: "7135550100" };
const CA_PLACE = { address: "100 King Street", city: "Toronto", state: "ON", zip: "M5V2T6", phone: "4165550100" };

export function clientPlace(input: {
  emergency?: { country?: string; state?: string; city?: string; address?: string; zip?: string } | null;
  fallback?: { country?: string; state?: string; city?: string; address?: string; zip?: string; phone?: string };
}): ClientPlace {
  const emergency = input.emergency || {};
  const fallback = input.fallback || {};
  const country = emergency.country === "CA" || (!emergency.country && fallback.country === "CA") ? "CA" : "US";
  const defaults = country === "CA" ? CA_PLACE : US_PLACE;
  const state = (emergency.state || fallback.state || defaults.state).trim().toUpperCase();
  const phone = (fallback.phone || "").replace(/\D/g, "").slice(0, 10);
  return {
    address: (emergency.address || fallback.address || defaults.address).trim().slice(0, 80),
    city: (emergency.city || fallback.city || defaults.city).trim().slice(0, 80),
    state: /^[A-Z]{2}$/.test(state) ? state : defaults.state,
    country,
    zip: (emergency.zip || fallback.zip || defaults.zip).trim().toUpperCase().slice(0, 10),
    phone: phone.length >= 10 ? phone : defaults.phone,
  };
}

export function personName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "SautiCall", last: "Customer" };
  if (parts.length === 1) return { first: parts[0].slice(0, 40), last: "Customer" };
  return { first: parts[0].slice(0, 40), last: parts.slice(1).join(" ").slice(0, 40) };
}

export function clientEmail(userId: number, email: string, domain: string) {
  const host = domain.trim().toLowerCase().replace(/^@/, "");
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return `customer-${userId}@${host}`;
  return email.trim().toLowerCase();
}

export function readVoipClientId(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (record.client) return String(record.client);
  const clients = record.clients;
  if (!Array.isArray(clients)) return "";
  const row = clients.find((item) => item && typeof item === "object" && (item as { client?: unknown }).client);
  return row ? String((row as { client?: unknown }).client || "") : "";
}
