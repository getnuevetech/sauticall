export function personFirstName(name: string) {
  const part = name.trim().split(/\s+/)[0];
  return part || "there";
}

export function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function money(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `$${value.toFixed(2)}`;
}

export function wholeMoney(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0;
  return Number.isInteger(value) ? `$${value}` : money(value);
}

export function chicagoDate(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }).format(new Date(time));
}

export function chicagoDay(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(new Date(time));
}

export function relativeWhen(iso: string, now = Date.now()) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const delta = now - time;
  if (delta < 60 * 60 * 1000) return "Just now";
  if (delta < 24 * 60 * 60 * 1000) return "Today";
  return chicagoDay(iso);
}

export function usagePercent(used: number, included: number) {
  if (!Number.isFinite(included) || included <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Math.max(0, used) / included) * 100)));
}

const HIGHLIGHTS: [string, string][] = [
  ["softphone", "Softphones"],
  ["voicemail", "Voicemail & forwarding"],
  ["desk_phones", "Desk phones"],
  ["business_hours", "Business hours"],
  ["ring_groups", "Ring groups"],
  ["ai", "AI receptionist"],
  ["queues", "Call queues"],
  ["reporting", "Call reporting"],
];

export function planHighlights(plan: { name: string; seats?: number; includedMinutes: number; features: string[] }, previous?: { name: string; features: string[] } | null) {
  const seats = plan.seats && plan.seats > 0 ? plan.seats : 1;
  const lines = [
    seats === 1 ? "1 person" : `Up to ${seats} people`,
    `${plan.includedMinutes.toLocaleString("en-US")} outbound minutes`,
  ];
  const own = new Set(plan.features);
  const labels = HIGHLIGHTS.filter(([key]) => own.has(key));
  if (previous) {
    const prev = new Set(previous.features);
    const prevLabels = HIGHLIGHTS.filter(([key]) => prev.has(key));
    const extras = labels.filter(([key]) => !prev.has(key));
    if (prevLabels.length >= 3 && prevLabels.every(([key]) => own.has(key)) && extras.length > 0 && extras.length <= 3) {
      return [...lines, `Everything in ${previous.name}`, ...extras.map(([, label]) => label)];
    }
  }
  return [...lines, ...labels.map(([, label]) => label)];
}

export function invoiceNumber(id: number) {
  return `INV-${String(id).padStart(3, "0")}`;
}
