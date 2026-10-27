export type ListedDid = { did: string; ratecenter: string; state: string; monthly: string };

export function normalizeRequestedDid(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const did = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(did) ? did : "";
}

export function didInfoIsAbsent(status: string) {
  return status === "no_did" || status === "invalid_did";
}

export function lookupMayOrder(check: { ok: boolean; owned: boolean; status: string }) {
  if (check.ok) return !check.owned;
  return check.status === "unreachable";
}

export function readDids(body: unknown, limit = 20): ListedDid[] {
  if (!body || typeof body !== "object") return [];
  const listed = (body as { dids?: unknown }).dids;
  const dids = Array.isArray(listed) ? listed : listed && typeof listed === "object" ? [listed] : [];
  const rows = dids.map((item) => {
    if (typeof item === "string") return { did: normalizeRequestedDid(item), ratecenter: "", state: "", monthly: "" };
    const row = item as { did?: unknown; ratecenter?: unknown; state?: unknown; province?: unknown; monthly?: unknown; perminute_monthly?: unknown };
    return {
      did: normalizeRequestedDid(String(row.did || "")),
      ratecenter: String(row.ratecenter || ""),
      state: String(row.state || row.province || ""),
      monthly: String(row.monthly || row.perminute_monthly || ""),
    };
  }).filter((item) => item.did);
  return limit > 0 ? rows.slice(0, limit) : rows;
}
