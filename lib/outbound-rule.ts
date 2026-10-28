export function outboundRuleBody(input: { name: string; trunkId: number; callerId: string; from: string; to: string; priority: number }) {
  return {
    Name: input.name,
    Prefix: "",
    Priority: input.priority,
    Routes: [{ TrunkId: input.trunkId, StripDigits: 0, Prepend: "", Append: "", CallerID: input.callerId }],
    DNRanges: [{ From: input.from, To: input.to }],
  };
}

export function nextOutboundPriority(body: unknown) {
  let highest = 0;
  walk(body, (record) => {
    const priority = Number(record.Priority);
    if (Number.isFinite(priority) && priority > highest) highest = priority;
  });
  return highest + 1;
}

export function outboundScopeVerdict(body: unknown, from: string, to: string) {
  let sawRanges = false;
  let scoped = false;
  walk(body, (record) => {
    if (!("DNRanges" in record)) return;
    sawRanges = true;
    const ranges = collectionItems(record.DNRanges);
    if (!ranges) return;
    scoped = scoped || ranges.some((item) => {
      if (!item || typeof item !== "object") return false;
      const range = item as { From?: unknown; To?: unknown };
      return String(range.From || "") === from && String(range.To || "") === to;
    });
  });
  if (!sawRanges) return "unknown" as const;
  return scoped ? "scoped" as const : "open" as const;
}

function collectionItems(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { delta?: unknown }).delta)) return (value as { delta: unknown[] }).delta;
  return null;
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const record = value as Record<string, unknown>;
  visit(record);
  for (const item of Object.values(record)) walk(item, visit);
}
