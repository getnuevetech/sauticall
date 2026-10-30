import { normalizeMobile } from "./verify-code.ts";

export const ROUTE_BLOCK = "Outbound calling is not connected yet.";

export type ListenPhase = "idle" | "prompt" | "message" | "done";
export type ListenOutcome = "pending" | "accepted" | "declined" | "opted_out" | "no_choice" | "voicemail" | "not_answered" | "uncertain";

export type ListenState = {
  phase: ListenPhase;
  outcome: ListenOutcome;
  repeatsLeft: number;
  contentPlayed: boolean;
};

export type ListenEvent = { kind: "digit"; digit: string } | { kind: "silence" } | { kind: "voicemail" } | { kind: "busy" } | { kind: "no_answer" } | { kind: "uncertain" } | { kind: "finished" };

export type NotifyPolicy = {
  repeats: number;
  promoEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  timeZone: string;
};

const OUTCOME_LABEL: Record<ListenOutcome, string> = {
  pending: "Waiting",
  accepted: "Heard the message",
  declined: "Declined. The message was not played.",
  opted_out: "Opted out. The message was not played.",
  no_choice: "No choice. The message was not played.",
  voicemail: "Voicemail. The message was not played.",
  not_answered: "No answer. The message was not played.",
  uncertain: "Uncertain. The message was not played.",
};

export function outcomeLabel(outcome: ListenOutcome, contentPlayed: boolean) {
  if (outcome === "accepted" && !contentPlayed) return "Pressed 1. The message has not finished.";
  return OUTCOME_LABEL[outcome];
}

export function choiceLine(businessName: string) {
  const name = businessName.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return "";
  return `Hello. This is an automated notification from ${name}. To hear the message, press 1. To decline, press 2. To stop future automated notifications from ${name}, press 9.`;
}

export function purposeCode(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

export function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minutesInZone(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return (hour % 24) * 60 + minute;
  } catch {
    return null;
  }
}

export function insideWindow(nowMinutes: number, start: number, end: number) {
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

export function hoursOpen(now: Date, policy: Pick<NotifyPolicy, "windowStart" | "windowEnd" | "timeZone">) {
  if (!policy.windowStart || !policy.windowEnd || !policy.timeZone) return false;
  const start = parseClock(policy.windowStart);
  const end = parseClock(policy.windowEnd);
  const minutes = minutesInZone(now, policy.timeZone);
  if (start == null || end == null || minutes == null) return false;
  return insideWindow(minutes, start, end);
}

export function normalizeNotifyPolicy(input: NotifyPolicy) {
  const repeats = Math.round(input.repeats);
  if (!Number.isFinite(repeats) || repeats < 0 || repeats > 2) return { ok: false as const, message: "Repeats must be 0, 1, or 2." };
  const start = input.windowStart.trim();
  const end = input.windowEnd.trim();
  const timeZone = input.timeZone.trim();
  if ((start || end || timeZone) && (!start || !end || !timeZone)) return { ok: false as const, message: "Set the opening time, closing time, and time zone together." };
  if (start && parseClock(start) == null) return { ok: false as const, message: "Use a time like 09:00." };
  if (end && parseClock(end) == null) return { ok: false as const, message: "Use a time like 17:00." };
  if (timeZone && minutesInZone(new Date(), timeZone) == null) return { ok: false as const, message: "That time zone is not recognized." };
  return { ok: true as const, policy: { repeats, promoEnabled: input.promoEnabled, windowStart: start, windowEnd: end, timeZone } satisfies NotifyPolicy };
}

export function startListen(repeats: number): ListenState {
  return { phase: "prompt", outcome: "pending", repeatsLeft: repeats, contentPlayed: false };
}

function done(outcome: ListenOutcome, contentPlayed = false): { state: ListenState; suppress: boolean } {
  return { state: { phase: "done", outcome, repeatsLeft: 0, contentPlayed }, suppress: outcome === "opted_out" };
}

export function applyListen(state: ListenState, event: ListenEvent) {
  if (state.phase === "done") return { state, suppress: false };
  if (event.kind === "finished") {
    if (state.phase !== "message") return { state, suppress: false };
    return { state: { ...state, phase: "done" as const, outcome: "accepted" as const, contentPlayed: true }, suppress: false };
  }
  if (state.phase === "message") return { state, suppress: false };
  if (state.phase === "idle") return { state, suppress: false };
  if (event.kind === "voicemail") return done("voicemail");
  if (event.kind === "busy" || event.kind === "no_answer") return done("not_answered");
  if (event.kind === "uncertain") return done("uncertain");
  const digit = event.kind === "digit" ? event.digit : "";
  if (digit === "1") return { state: { ...state, phase: "message" as const, outcome: "accepted" as const, contentPlayed: false }, suppress: false };
  if (digit === "2") return done("declined");
  if (digit === "9") return done("opted_out");
  if (state.repeatsLeft > 0) return { state: { ...state, repeatsLeft: state.repeatsLeft - 1 }, suppress: false };
  return done("no_choice");
}

export type DialGate = {
  serviceOn: boolean;
  clipReady: boolean;
  businessName: string;
  callerId: string;
  consent: string;
  number: string;
  suppressed: boolean;
  purposeEnabled: boolean;
  promotional: boolean;
  promoAllowed: boolean;
  hoursOpen: boolean;
};

export function dialBlockers(gate: DialGate) {
  const reasons: string[] = [];
  if (!gate.serviceOn) reasons.push("Automated notifications are off for this account.");
  if (!gate.clipReady) reasons.push("Keep an audio version before using it.");
  if (!choiceLine(gate.businessName)) reasons.push("Enter the business name people will hear.");
  if (!normalizeMobile(gate.callerId)) reasons.push("Enter the caller ID as a phone number.");
  if (!gate.purposeEnabled) reasons.push("That purpose is turned off.");
  if (gate.promotional && !gate.promoAllowed) reasons.push("Promotional notifications are turned off.");
  if (!normalizeMobile(gate.number)) reasons.push("Enter a valid phone number.");
  if (!gate.consent.trim()) reasons.push("Record how this person gave permission. A checkbox is not enough.");
  if (gate.suppressed) reasons.push("This number opted out.");
  if (!gate.hoursOpen) reasons.push("Calling hours are closed.");
  reasons.push(ROUTE_BLOCK);
  return reasons;
}

export function practiceAllowed(reasons: string[]) {
  return reasons.length === 1 && reasons[0] === ROUTE_BLOCK;
}
