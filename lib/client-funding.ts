export function planFundAmount(credit: unknown) {
  const amount = Number(credit);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
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
