function trunkDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function records(body: unknown) {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    found.push(record);
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk(body);
  return found;
}

function items(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { delta?: unknown }).delta)) return (value as { delta: unknown[] }).delta;
  return [];
}

export function portNumbers(raw: string) {
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const digits = trunkDigits(part);
    if (/^[2-9]\d{9}$/.test(digits)) seen.add(digits);
  }
  return [...seen];
}

export function portIsComplete(body: unknown) {
  return records(body).some((record) => Object.entries(record).some(([key, value]) => {
    if (typeof value !== "string" || !/status|state/i.test(key)) return false;
    return /^(completed|complete|ported|foc)$/i.test(value.trim());
  }));
}

export function inboundRuleFound(body: unknown, trunkId: number, did: string) {
  const digits = trunkDigits(did);
  return records(body).some((record) => {
    const id = Number(record.TrunkId);
    const listed = trunkDigits(String(record.DID || record.Did || ""));
    const hasTrunk = "TrunkId" in record && Number.isFinite(id) && id > 0;
    const hasDid = listed.length >= 10;
    const trunkMatch = trunkId > 0 && id === trunkId;
    const didMatch = digits.length >= 10 && listed === digits;
    if (hasTrunk && hasDid) return trunkMatch && didMatch;
    if (hasDid) return didMatch;
    if (hasTrunk) return trunkMatch;
    return false;
  });
}

export function outboundRuleFound(body: unknown, trunkId: number, from: string, to: string) {
  return records(body).some((record) => {
    const routes = items(record.Routes);
    const usesTrunk = routes.some((route) => route && typeof route === "object" && Number((route as { TrunkId?: unknown }).TrunkId) === trunkId);
    if (!usesTrunk || trunkId < 1) return false;
    if (!from || !to) return true;
    const ranges = items(record.DNRanges);
    return ranges.some((range) => {
      if (!range || typeof range !== "object") return false;
      const item = range as { From?: unknown; To?: unknown };
      return String(item.From || "") === from && String(item.To || "") === to;
    });
  });
}
