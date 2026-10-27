export type ListedSubaccount = {
  id: string;
  account: string;
  username: string;
  description: string;
};

export function subaccountDigits(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[1-9]\d*$/.test(text) ? text : "";
}

export function readCreatedSubaccount(body: unknown) {
  if (!body || typeof body !== "object") return { id: "", account: "" };
  const record = body as Record<string, unknown>;
  return {
    id: subaccountDigits(record.id),
    account: String(record.account || record.subaccount || "").trim(),
  };
}

export function readListedSubaccounts(body: unknown): ListedSubaccount[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const list = record.accounts || record.subaccounts || record.sub_accounts;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: subaccountDigits(row.id),
      account: String(row.account || "").trim(),
      username: String(row.username || "").trim(),
      description: String(row.description || "").trim(),
    };
  }).filter((item) => item.account);
}

export function matchListedSubaccount(list: ListedSubaccount[], username: string, description: string) {
  return list.find((item) => item.username === username || item.account.endsWith(`_${username}`) || item.description === description);
}

export function subaccountUpdateParams(id: string, fields: Record<string, string>) {
  const digits = subaccountDigits(id);
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "id" || key === "account") continue;
    next[key] = value;
  }
  if (digits) next.id = digits;
  return next;
}
