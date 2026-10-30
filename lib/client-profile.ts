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

export function clientPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return "";
}

export function clientPlace(input: {
  customer?: { country?: string; state?: string; city?: string; address?: string; zip?: string; phone?: string } | null;
  emergency?: { country?: string; state?: string; city?: string; address?: string; zip?: string } | null;
  fallback?: { country?: string; state?: string; city?: string; address?: string; zip?: string; phone?: string };
}): ClientPlace {
  const customer = input.customer || {};
  const emergency = input.emergency || {};
  const fallback = input.fallback || {};
  const country = customer.country === "CA" || emergency.country === "CA" || (!customer.country && !emergency.country && fallback.country === "CA") ? "CA" : "US";
  const defaults = country === "CA" ? CA_PLACE : US_PLACE;
  const chosen = (customerValue?: string, emergencyValue?: string, fallbackValue?: string, blank = "") =>
    (customerValue || "").trim() || (emergencyValue || "").trim() || (fallbackValue || "").trim() || blank;
  const state = chosen(customer.state, emergency.state, fallback.state, defaults.state).toUpperCase();
  const phone = clientPhone(customer.phone || "") || clientPhone(fallback.phone || "") || defaults.phone;
  return {
    address: chosen(customer.address, emergency.address, fallback.address, defaults.address).slice(0, 80),
    city: chosen(customer.city, emergency.city, fallback.city, defaults.city).slice(0, 80),
    state: /^[A-Z]{2}$/.test(state) ? state : defaults.state,
    country,
    zip: chosen(customer.zip, emergency.zip, fallback.zip, defaults.zip).toUpperCase().slice(0, 10),
    phone,
  };
}

export function accountClientProfile(input: {
  name: string;
  phone: string;
  address?: { country?: string; state?: string; city?: string; address?: string; zip?: string } | null;
  fallback?: { country?: string; state?: string; city?: string; address?: string; zip?: string; phone?: string };
}) {
  const phone = clientPhone(input.phone);
  if (!phone) return { ok: false as const, message: "Add a mobile number before the client account can be created." };
  const address = input.address;
  const place = clientPlace({
    customer: {
      country: address?.country,
      state: address?.state,
      city: address?.city,
      address: address?.address,
      zip: address?.zip,
      phone,
    },
    fallback: input.fallback,
  });
  return { ok: true as const, profile: { ...personName(input.name), ...place } };
}

export function personName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "SautiCall", last: "Customer" };
  if (parts.length === 1) return { first: parts[0].slice(0, 40), last: "Customer" };
  return { first: parts[0].slice(0, 40), last: parts.slice(1).join(" ").slice(0, 40) };
}

export function clientEmail(userId: number, _email: string, domain: string) {
  const host = domain.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return "";
  return `customer-${userId}@${host}`;
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
