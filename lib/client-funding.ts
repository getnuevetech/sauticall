export function fundNeedsRetry(message: string) {
  return !/turned off|no phone-company balance set/i.test(message);
}

export function fundRetryDetail(reason: string, retryOk: boolean, retryMessage: string) {
  if (retryOk) return `Retry successful. ${retryMessage}`;
  return `${reason} Retry did not add the balance (${retryMessage}). An administrator has to fix this.`;
}

export function planFundAmount(credit: unknown) {
  const amount = Number(credit);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
}

export function readClientBalance(body: unknown) {
  const raw = balanceValue(body);
  if (raw == null || typeof raw === "object") return null;
  const amount = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

export function moneyParam(value: unknown) {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return "0.00";
  return amount.toFixed(2);
}

export function resellerOrderFees(input: { chargeClient: boolean; monthly?: unknown; setup?: unknown; minute?: unknown }) {
  if (!input.chargeClient) return { monthly: "0.00", setup: "0.00", minute: "0.00" };
  return { monthly: moneyParam(input.monthly), setup: moneyParam(input.setup), minute: moneyParam(input.minute) };
}

export function balanceCovers(balance: number | null, fees: { monthly: string; setup: string }) {
  if (balance == null) return true;
  return balance + 0.001 >= Number(fees.monthly) + Number(fees.setup);
}

function balanceValue(body: unknown): unknown {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.current_balance != null && typeof record.current_balance !== "object") return record.current_balance;
  if (record.balance != null) {
    if (typeof record.balance !== "object") return record.balance;
    const nested = record.balance as Record<string, unknown>;
    if (nested.current_balance != null && typeof nested.current_balance !== "object") return nested.current_balance;
    return null;
  }
  if (record.client_balance != null && typeof record.client_balance !== "object") return record.client_balance;
  const client = record.client;
  if (client && typeof client === "object" && "balance" in client) {
    const value = (client as { balance?: unknown }).balance;
    if (value != null && typeof value !== "object") return value;
  }
  return null;
}
