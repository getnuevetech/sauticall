export type ListedDid = { did: string; ratecenter: string; state: string; monthly: string };

export function readDids(body: unknown): ListedDid[] {
  if (!body || typeof body !== "object") return [];
  const dids = (body as { dids?: unknown }).dids;
  if (!Array.isArray(dids)) return [];
  return dids.slice(0, 20).map((item) => {
    if (typeof item === "string") return { did: item, ratecenter: "", state: "", monthly: "" };
    const row = item as { did?: unknown; ratecenter?: unknown; state?: unknown; province?: unknown; monthly?: unknown };
    return {
      did: String(row.did || ""),
      ratecenter: String(row.ratecenter || ""),
      state: String(row.state || row.province || ""),
      monthly: String(row.monthly || ""),
    };
  }).filter((item) => item.did);
}
