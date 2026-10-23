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
