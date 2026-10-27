const KNOWN = ["ulaw", "g729", "gsm"] as const;

export const DEFAULT_LINE_CODECS = "ulaw;g729;gsm";

export function lineCodecs(value: string) {
  const parts = value.toLowerCase().replace(/\./g, "").split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.includes("all")) return "all";
  const allowed = KNOWN.filter((codec) => parts.includes(codec));
  return allowed.join(";") || "ulaw";
}
