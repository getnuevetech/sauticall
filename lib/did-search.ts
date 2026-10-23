export type DigitSearch = { mode: "number" | "prefix" | "suffix"; query: string };

export function parseDigitSearch(mode: string, raw: string): { ok: true; search: DigitSearch } | { ok: false; message: string } {
  const kind = mode === "number" || mode === "prefix" || mode === "suffix" ? mode : "";
  if (!kind) return { ok: false, message: "Choose how to search." };
  const query = raw.replace(/\D/g, "");
  if (kind === "number") {
    if (!/^[2-9]\d{9}$/.test(query)) return { ok: false, message: "Enter a 10-digit number, such as 7135550100." };
    return { ok: true, search: { mode: kind, query } };
  }
  if (!/^\d{3,10}$/.test(query)) {
    const message = kind === "prefix" ? "Enter 3 to 10 digits for the start of the number." : "Enter 3 to 10 digits for the end of the number.";
    return { ok: false, message };
  }
  return { ok: true, search: { mode: kind, query } };
}

export function didMatches(did: string, search: DigitSearch) {
  const digits = did.replace(/\D/g, "");
  if (search.mode === "number") return digits === search.query;
  if (search.mode === "prefix") return digits.startsWith(search.query);
  return digits.endsWith(search.query);
}

export function carrierSearchType(mode: DigitSearch["mode"]) {
  if (mode === "prefix") return "starts";
  if (mode === "suffix") return "ends";
  return "contains";
}
