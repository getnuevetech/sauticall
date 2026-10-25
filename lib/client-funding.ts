export function openingBalance(planName: string) {
  const name = planName.trim().toLowerCase().replace(/\s+/g, " ");
  if (name === "solo") return 5;
  if (name === "small business") return 10;
  if (name === "team") return 15;
  return 0;
}

export function readClientBalance(body: unknown) {
  const raw = balanceValue(body);
  if (raw == null) return null;
  const amount = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function balanceValue(body: unknown): unknown {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.balance != null) return record.balance;
  if (record.client_balance != null) return record.client_balance;
  const client = record.client;
  if (client && typeof client === "object" && "balance" in client) return (client as { balance?: unknown }).balance;
  return null;
}
