export type ResellerPackage = { id: string; name: string; monthly: number; setup: number };

function money(value: unknown) {
  const number = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

export function readPackages(body: unknown): ResellerPackage[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const list = record.packages || record.package;
  const rows = Array.isArray(list) ? list : list && typeof list === "object" ? [list] : [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = String(row.value ?? row.package ?? row.id ?? "").trim();
    if (!/^\d+$/.test(id)) return [];
    return [{ id, name: String(row.name ?? row.description ?? "").trim(), monthly: money(row.monthly_fee), setup: money(row.setup_fee) }];
  });
}

export function chooseResellerPackage(assigned: unknown, catalog: unknown) {
  const clientPackage = readPackages(assigned)[0];
  if (clientPackage) return clientPackage.id;
  const list = readPackages(catalog);
  const free = list.find((item) => item.monthly === 0 && item.setup === 0);
  if (free) return free.id;
  return [...list].sort((left, right) => left.monthly - right.monthly || left.setup - right.setup)[0]?.id || "";
}

export function choosePlanPackage(planName: string, catalog: unknown) {
  const list = readPackages(catalog);
  const wanted = planName.trim().toLowerCase();
  const named = wanted ? list.find((item) => item.name.trim().toLowerCase() === wanted) : undefined;
  if (named) return named.id;
  const fallback = list.find((item) => item.name.trim().toLowerCase() === "default");
  if (fallback) return fallback.id;
  return chooseResellerPackage(null, catalog);
}
