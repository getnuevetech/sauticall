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

export function bundlePayLabel(amount: string, gatewayLabel: string) {
  const method = gatewayLabel.replace(/\s*via\s+stripe\b/gi, "").replace(/\bstripe\b/gi, "").replace(/\s+/g, " ").trim();
  return method ? `Pay ${amount} with ${method}` : `Pay ${amount}`;
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

export function invoiceText(input: { id: number; amountCents: number; currency: string; description: string; planName: string; when: string }) {
  const lines = [
    "SautiCall",
    `Invoice ${invoiceNumber(input.id)}`,
    `Date: ${chicagoDate(input.when)}`,
    `Amount: ${money(input.amountCents / 100)} ${input.currency || "USD"}`,
    "Status: Paid",
  ];
  if (input.planName) lines.push(`Plan: ${input.planName}`);
  if (input.description) lines.push(`Description: ${input.description}`);
  return `${lines.join("\n")}\n`;
}

export function formatPhone(did: string) {
  const digits = did.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^\d{10}$/.test(ten)) return did;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function monthlyPrice(value: string) {
  const amount = Number(value);
  if (!value || !Number.isFinite(amount)) return "";
  return `$${amount.toFixed(2)}`;
}

export function perMinute(price: number, minutes: number) {
  if (!Number.isFinite(price) || !Number.isFinite(minutes) || minutes <= 0) return "";
  return `$${(price / minutes).toFixed(2)} / min`;
}

export function callDuration(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function chicagoClock(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(time));
}

export function clockLabel(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value || "";
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${suffix}`;
}

export function extensionSetup(status: string) {
  if (status === "removed") return { label: "Removed", tone: "muted" as const };
  if (status === "created" || status === "manual") return { label: "Provisioned", tone: "ok" as const };
  if (status === "failed") return { label: "Needs attention", tone: "warn" as const };
  return { label: "Waiting", tone: "wait" as const };
}

export type HelpTopic = "started" | "numbers" | "billing" | "phone";

export function helpTopic(title: string): HelpTopic {
  const text = title.toLowerCase();
  if (/number|port|transfer|e911|emergency address/.test(text)) return "numbers";
  if (/minute|bill|plan|pay|invoice|price|subscription/.test(text)) return "billing";
  if (/extension|voicemail|queue|ring|phone system|team member|business hour|person/.test(text)) return "phone";
  return "started";
}

export const accountHelp = [
  { category: "numbers" as const, title: "How do I get my first business number?", body: "Open Phone numbers, choose a state and city, and search. Select a number, add the emergency address, then review the purchase. Selecting a number does not buy it.", href: "/account/numbers", link: "Go to phone numbers" },
  { category: "numbers" as const, title: "How can I transfer my existing number?", body: "Open the transfer page and send the numbers and the current account details. SautiCall tracks the request while the transfer is completed.", href: "/account/porting", link: "Start a transfer" },
  { category: "billing" as const, title: "Where can I check my remaining minutes?", body: "Calls & voicemail shows the minutes left on your plan, any extra minutes you bought, and the outbound minutes used in the current period.", href: "/account/minutes", link: "View minutes" },
  { category: "phone" as const, title: "How do I set up voicemail?", body: "Each person gets a mailbox with their extension. Messages stay in the phone app. After-hours calls go to voicemail once business hours are saved on the phone system.", href: "/account/minutes", link: "Open calls & voicemail" },
  { category: "phone" as const, title: "How do I add a team member?", body: "Save the company name on the phone system, then add the person with their name and email. They are added to that company department.", href: "/account/phone", link: "Go to phone system" },
];
