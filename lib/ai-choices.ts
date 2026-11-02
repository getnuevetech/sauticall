import type { Plan } from "./types.ts";
import { clockLabel } from "./account-display.ts";

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"] as const;

type Tier = "core" | "wide" | "full";

const RAW: readonly (readonly [string, string, string, Tier])[] = [
  ["en-us", "General American", "Americas", "core"],
  ["en-us-south", "Southern United States", "Americas", "core"],
  ["en-us-ny", "New York", "Americas", "core"],
  ["en-us-midwest", "Midwestern United States", "Americas", "full"],
  ["en-us-west", "Western United States", "Americas", "full"],
  ["en-ca", "Canadian", "Americas", "core"],
  ["en-ca-east", "Eastern Canadian", "Americas", "full"],
  ["en-jm", "Jamaican", "Americas", "wide"],
  ["en-tt", "Trinidadian", "Americas", "wide"],
  ["en-bb", "Barbadian", "Americas", "full"],
  ["en-bz", "Belizean", "Americas", "full"],
  ["en-gy", "Guyanese", "Americas", "full"],
  ["en-ht", "Haitian", "Americas", "full"],
  ["en-cu", "Cuban", "Americas", "full"],
  ["en-mx", "Mexican", "Americas", "wide"],
  ["en-cr", "Costa Rican", "Americas", "full"],
  ["en-pa", "Panamanian", "Americas", "full"],
  ["en-co", "Colombian", "Americas", "full"],
  ["en-ve", "Venezuelan", "Americas", "full"],
  ["en-pe", "Peruvian", "Americas", "full"],
  ["en-cl", "Chilean", "Americas", "full"],
  ["en-ar", "Argentine", "Americas", "wide"],
  ["en-uy", "Uruguayan", "Americas", "full"],
  ["en-br", "Brazilian", "Americas", "wide"],
  ["en-gb", "British Received Pronunciation", "Europe", "core"],
  ["en-gb-north", "Northern England", "Europe", "core"],
  ["en-gb-west", "West Country", "Europe", "full"],
  ["en-gb-wales", "Welsh", "Europe", "full"],
  ["en-sct", "Scottish", "Europe", "core"],
  ["en-ie", "Irish", "Europe", "core"],
  ["en-ie-north", "Northern Irish", "Europe", "full"],
  ["en-fr", "French", "Europe", "wide"],
  ["en-be", "Belgian", "Europe", "full"],
  ["en-nl", "Dutch", "Europe", "wide"],
  ["en-de", "German", "Europe", "wide"],
  ["en-at", "Austrian", "Europe", "full"],
  ["en-ch", "Swiss", "Europe", "full"],
  ["en-it", "Italian", "Europe", "wide"],
  ["en-es", "Spanish", "Europe", "wide"],
  ["en-pt", "Portuguese", "Europe", "wide"],
  ["en-se", "Swedish", "Europe", "wide"],
  ["en-no", "Norwegian", "Europe", "full"],
  ["en-dk", "Danish", "Europe", "full"],
  ["en-fi", "Finnish", "Europe", "full"],
  ["en-is", "Icelandic", "Europe", "full"],
  ["en-pl", "Polish", "Europe", "wide"],
  ["en-cz", "Czech", "Europe", "full"],
  ["en-sk", "Slovak", "Europe", "full"],
  ["en-hu", "Hungarian", "Europe", "full"],
  ["en-ro", "Romanian", "Europe", "full"],
  ["en-bg", "Bulgarian", "Europe", "full"],
  ["en-gr", "Greek", "Europe", "full"],
  ["en-hr", "Croatian", "Europe", "full"],
  ["en-rs", "Serbian", "Europe", "full"],
  ["en-si", "Slovenian", "Europe", "full"],
  ["en-ua", "Ukrainian", "Europe", "full"],
  ["en-ru", "Russian", "Europe", "wide"],
  ["en-ee", "Estonian", "Europe", "full"],
  ["en-lv", "Latvian", "Europe", "full"],
  ["en-lt", "Lithuanian", "Europe", "full"],
  ["en-mt", "Maltese", "Europe", "full"],
  ["en-cy", "Cypriot", "Europe", "full"],
  ["en-za", "South African", "Africa", "core"],
  ["en-za-cape", "Cape Town", "Africa", "full"],
  ["en-ng", "Nigerian", "Africa", "wide"],
  ["en-gh", "Ghanaian", "Africa", "wide"],
  ["en-ke", "Kenyan", "Africa", "wide"],
  ["en-ug", "Ugandan", "Africa", "full"],
  ["en-tz", "Tanzanian", "Africa", "full"],
  ["en-rw", "Rwandan", "Africa", "full"],
  ["en-et", "Ethiopian", "Africa", "full"],
  ["en-cm", "Cameroonian", "Africa", "full"],
  ["en-sn", "Senegalese", "Africa", "full"],
  ["en-lr", "Liberian", "Africa", "full"],
  ["en-sl", "Sierra Leonean", "Africa", "full"],
  ["en-gm", "Gambian", "Africa", "full"],
  ["en-mw", "Malawian", "Africa", "full"],
  ["en-zm", "Zambian", "Africa", "full"],
  ["en-zw", "Zimbabwean", "Africa", "full"],
  ["en-bw", "Botswana", "Africa", "full"],
  ["en-na", "Namibian", "Africa", "full"],
  ["en-mz", "Mozambican", "Africa", "full"],
  ["en-ao", "Angolan", "Africa", "full"],
  ["en-mg", "Malagasy", "Africa", "full"],
  ["en-mu", "Mauritian", "Africa", "full"],
  ["en-eg", "Egyptian", "Africa", "wide"],
  ["en-ma", "Moroccan", "Africa", "full"],
  ["en-tn", "Tunisian", "Africa", "full"],
  ["en-dz", "Algerian", "Africa", "full"],
  ["en-ly", "Libyan", "Africa", "full"],
  ["en-sd", "Sudanese", "Africa", "full"],
  ["en-ae", "Gulf Arabic", "Middle East", "wide"],
  ["en-sa", "Saudi", "Middle East", "full"],
  ["en-qa", "Qatari", "Middle East", "full"],
  ["en-kw", "Kuwaiti", "Middle East", "full"],
  ["en-bh", "Bahraini", "Middle East", "full"],
  ["en-om", "Omani", "Middle East", "full"],
  ["en-ye", "Yemeni", "Middle East", "full"],
  ["en-lb", "Lebanese", "Middle East", "full"],
  ["en-jo", "Jordanian", "Middle East", "full"],
  ["en-iq", "Iraqi", "Middle East", "full"],
  ["en-il", "Israeli", "Middle East", "full"],
  ["en-tr", "Turkish", "Middle East", "wide"],
  ["en-ir", "Iranian", "Middle East", "full"],
  ["en-in", "Indian", "Asia", "wide"],
  ["en-in-south", "South Indian", "Asia", "full"],
  ["en-pk", "Pakistani", "Asia", "wide"],
  ["en-bd", "Bangladeshi", "Asia", "full"],
  ["en-lk", "Sri Lankan", "Asia", "full"],
  ["en-np", "Nepali", "Asia", "full"],
  ["en-mm", "Burmese", "Asia", "full"],
  ["en-th", "Thai", "Asia", "wide"],
  ["en-vn", "Vietnamese", "Asia", "wide"],
  ["en-kh", "Cambodian", "Asia", "full"],
  ["en-la", "Lao", "Asia", "full"],
  ["en-my", "Malaysian", "Asia", "full"],
  ["en-sg", "Singaporean", "Asia", "wide"],
  ["en-id", "Indonesian", "Asia", "wide"],
  ["en-ph", "Philippine", "Asia", "wide"],
  ["en-hk", "Hong Kong", "Asia", "full"],
  ["en-cn", "Mainland Chinese", "Asia", "wide"],
  ["en-tw", "Taiwanese", "Asia", "full"],
  ["en-jp", "Japanese", "Asia", "wide"],
  ["en-kr", "Korean", "Asia", "wide"],
  ["en-mn", "Mongolian", "Asia", "full"],
  ["en-kz", "Kazakh", "Asia", "full"],
  ["en-uz", "Uzbek", "Asia", "full"],
  ["en-ge", "Georgian", "Asia", "full"],
  ["en-am", "Armenian", "Asia", "full"],
  ["en-az", "Azerbaijani", "Asia", "full"],
  ["en-af", "Afghan", "Asia", "full"],
  ["en-au", "Australian", "Pacific", "core"],
  ["en-nz", "New Zealand", "Pacific", "core"],
  ["en-fj", "Fijian", "Pacific", "full"],
  ["en-ws", "Samoan", "Pacific", "full"],
  ["en-pg", "Papua New Guinean", "Pacific", "full"],
  ["en-neutral", "Neutral English", "Pacific", "core"],
];

export type Accent = { id: string; label: string; region: string; tier: Tier; voice: string };

export const ACCENTS: Accent[] = RAW.map((row, index) => ({
  id: row[0],
  label: row[1],
  region: row[2],
  tier: row[3],
  voice: VOICES[index % VOICES.length],
}));

const ACCENT_IDS = new Set(ACCENTS.map((accent) => accent.id));
const VOICE_IDS = new Set<string>(VOICES);

export const ACCENT_REGIONS = [...new Set(ACCENTS.map((accent) => accent.region))];

export const TONES = [
  { id: "professional", label: "Professional" },
  { id: "warm", label: "Warm" },
  { id: "brief", label: "Brief" },
  { id: "formal", label: "Formal" },
  { id: "calm", label: "Calm" },
] as const;

export const GREETINGS = [
  { id: "thanks", label: "Thank you for calling", text: "Thank you for calling. How can I help you today?" },
  { id: "reached", label: "You have reached the office", text: "Hello, you have reached the office. How can I help you?" },
  { id: "direct", label: "How may I direct your call", text: "Good day. How may I direct your call?" },
  { id: "welcome", label: "Welcome", text: "Welcome. Please tell me how I can help." },
  { id: "brief", label: "Hello", text: "Hello. How can I help?" },
] as const;

export const LANGUAGES = [
  { id: "en-US", label: "English (United States)", english: true },
  { id: "en-GB", label: "English (United Kingdom)", english: true },
  { id: "en-AU", label: "English (Australia)", english: true },
  { id: "en-CA", label: "English (Canada)", english: true },
  { id: "en-ZA", label: "English (South Africa)", english: true },
  { id: "en-NG", label: "English (Nigeria)", english: true },
  { id: "en-IN", label: "English (India)", english: true },
  { id: "es-MX", label: "Spanish (Mexico)", english: false },
  { id: "es-ES", label: "Spanish (Spain)", english: false },
  { id: "pt-BR", label: "Portuguese (Brazil)", english: false },
  { id: "fr-FR", label: "French", english: false },
  { id: "de-DE", label: "German", english: false },
  { id: "it-IT", label: "Italian", english: false },
  { id: "nl-NL", label: "Dutch", english: false },
  { id: "pl-PL", label: "Polish", english: false },
  { id: "ru-RU", label: "Russian", english: false },
  { id: "ar-SA", label: "Arabic", english: false },
  { id: "hi-IN", label: "Hindi", english: false },
  { id: "zh-CN", label: "Chinese (Mandarin)", english: false },
  { id: "ja-JP", label: "Japanese", english: false },
  { id: "ko-KR", label: "Korean", english: false },
  { id: "sw-KE", label: "Swahili", english: false },
  { id: "tr-TR", label: "Turkish", english: false },
  { id: "vi-VN", label: "Vietnamese", english: false },
  { id: "id-ID", label: "Indonesian", english: false },
  { id: "th-TH", label: "Thai", english: false },
] as const;

export const AFTER_ACTIONS = [
  { id: "message", label: "Take a message" },
  { id: "closed", label: "Say the office is closed" },
  { id: "voicemail", label: "Send the caller to voicemail" },
  { id: "transfer", label: "Transfer to a chosen extension" },
] as const;

export const OFFICE_TIMES = Array.from({ length: 24 * 4 }, (_, index) => {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  return `${hour}:${minute}`;
});

const OFFICE_TIME_SET = new Set(OFFICE_TIMES);

export function isOfficeTime(value: string) {
  return OFFICE_TIME_SET.has(value);
}

export function nearestOfficeTime(value: string, fallback = "09:00") {
  if (isOfficeTime(value)) return value;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const minutes = (Number(match[1]) % 24) * 60 + Math.min(59, Number(match[2]));
  const slot = Math.round(minutes / 15) * 15;
  const wrapped = ((slot % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const minute = String(wrapped % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function officeTimeLabel(value: string) {
  return clockLabel(nearestOfficeTime(value));
}

type PlanAccents = { features?: string[]; custom?: boolean; accents?: string[] };

function knownAccentIds(ids: string[]) {
  const wanted = new Set(ids);
  return ACCENTS.filter((accent) => wanted.has(accent.id)).map((accent) => accent.id);
}

export function defaultAccentIds(plan: PlanAccents) {
  const features = new Set(plan.features || []);
  if (!features.has("ai") && !features.has("ai_any_language")) return [];
  if (plan.custom) return ACCENTS.map((accent) => accent.id);
  if (features.has("ai_any_language") && features.has("queues")) return ACCENTS.map((accent) => accent.id);
  if (features.has("ai_any_language")) return ACCENTS.filter((accent) => accent.tier !== "full").map((accent) => accent.id);
  return ACCENTS.filter((accent) => accent.tier === "core").map((accent) => accent.id);
}

export function accentsForPlan(plan: PlanAccents | null | undefined) {
  if (!plan) return [];
  if (Array.isArray(plan.accents)) return knownAccentIds(plan.accents);
  return defaultAccentIds(plan);
}

export function accentById(id: string) {
  return ACCENTS.find((accent) => accent.id === id.trim()) || null;
}

const WOMAN_VOICES = ["coral", "shimmer", "sage", "marin"];
const MAN_VOICES = ["ash", "echo", "verse", "cedar"];

export const GENDERS = [
  { id: "woman", label: "Woman" },
  { id: "man", label: "Man" },
  { id: "neutral", label: "Neutral" },
] as const;

export function storedGender(value: string) {
  const text = value.trim().toLowerCase();
  if (text === "woman" || text === "female") return "woman";
  if (text === "man" || text === "male") return "man";
  if (text === "neutral") return "neutral";
  return "";
}

export function genderLabel(id: string) {
  return GENDERS.find((gender) => gender.id === id)?.label || "";
}

export function spokenVoiceFor(label: string, gender = "") {
  const accent = accentById(label);
  const chosen = storedGender(gender);
  if (accent && chosen) {
    const set = chosen === "woman" ? WOMAN_VOICES : chosen === "man" ? MAN_VOICES : ["alloy"];
    const index = Math.max(0, ACCENTS.findIndex((item) => item.id === accent.id));
    return set[index % set.length];
  }
  if (accent) return accent.voice;
  const voice = label.trim().toLowerCase();
  return VOICE_IDS.has(voice) ? voice : "alloy";
}

export function storedVoice(label: string, allowed?: string[]) {
  const trimmed = label.trim();
  if (!trimmed) {
    if (allowed && allowed.length === 0) return { ok: false as const, message: "Choose an accent included on this plan." };
    if (allowed && allowed.length > 0) return { ok: true as const, voice: allowed[0] };
    return { ok: true as const, voice: "" };
  }
  const accent = accentById(trimmed);
  if (accent) {
    if (allowed && !allowed.includes(accent.id)) return { ok: false as const, message: "Choose an accent included on this plan." };
    return { ok: true as const, voice: accent.id };
  }
  const voice = trimmed.toLowerCase();
  if (VOICE_IDS.has(voice)) {
    if (allowed) return { ok: false as const, message: "Choose an accent included on this plan." };
    return { ok: true as const, voice };
  }
  return { ok: false as const, message: "Choose an accent." };
}

export function languagesForPlan(multilingual: boolean) {
  return LANGUAGES.filter((language) => multilingual || language.english);
}

export function storedLanguage(label: string, multilingual: boolean) {
  const found = LANGUAGES.find((language) => language.id === label.trim());
  if (found && (multilingual || found.english)) return found.id;
  return "en-US";
}

export function languageLabel(id: string) {
  return LANGUAGES.find((language) => language.id === id)?.label || "English (United States)";
}

export function storedTone(label: string) {
  const trimmed = label.trim().toLowerCase();
  return TONES.find((tone) => tone.id === trimmed || tone.label.toLowerCase() === trimmed)?.id || "professional";
}

export function toneLabel(id: string) {
  return TONES.find((tone) => tone.id === id)?.label || "Professional";
}

export function greetingText(value: string) {
  const trimmed = value.trim();
  const preset = GREETINGS.find((greeting) => greeting.id === trimmed || greeting.text === trimmed);
  if (preset) return preset.text;
  return trimmed.slice(0, 300);
}

export function greetingValue(stored: string) {
  const trimmed = stored.trim();
  return GREETINGS.find((greeting) => greeting.id === trimmed || greeting.text === trimmed)?.id || "";
}

export type OfficeHours = { open: string; close: string; action: string; target: string };

export function readOfficeHours(stored: string): OfficeHours {
  const parts = stored.split("|");
  if (parts.length >= 3 && isOfficeTime(parts[0]) && isOfficeTime(parts[1])) {
    const action = AFTER_ACTIONS.some((item) => item.id === parts[2]) ? parts[2] : "message";
    return { open: parts[0], close: parts[1], action, target: (parts[3] || "").trim().slice(0, 20) };
  }
  const legacy = stored.toLowerCase();
  const action = legacy.includes("voicemail") ? "voicemail" : legacy.includes("transfer") ? "transfer" : legacy.includes("closed") ? "closed" : "message";
  return { open: "09:00", close: "17:00", action, target: "" };
}

export function packOfficeHours(input: { open: string; close: string; action: string; target: string }): OfficeHours & { packed: string } {
  const open = nearestOfficeTime(input.open, "09:00");
  const close = nearestOfficeTime(input.close, "17:00");
  const action = AFTER_ACTIONS.some((item) => item.id === input.action) ? input.action : "message";
  const target = action === "transfer" ? input.target.trim().slice(0, 20) : "";
  return { open, close, action, target, packed: `${open}|${close}|${action}|${target}` };
}

export function officeHoursSpeech(stored: string) {
  const hours = readOfficeHours(stored);
  const open = clockLabel(hours.open);
  const close = clockLabel(hours.close);
  const action = hours.action === "transfer" && hours.target
    ? `transfer to extension ${hours.target}`
    : hours.action === "voicemail"
      ? "send the caller to voicemail"
      : hours.action === "closed"
        ? "say the office is closed and offer to take a message"
        : "take a message";
  return `Office hours are ${open} to ${close}. Outside those hours, ${action}. Do not promise a callback outside those hours.`;
}

export function speakingDirections(input: { voiceLabel: string; gender?: string; language: string; afterHours: string }) {
  const accent = accentById(input.voiceLabel);
  const language = languageLabel(storedLanguage(input.language, true));
  const gender = genderLabel(storedGender(input.gender || ""));
  const voiceLine = gender ? `Use a ${gender.toLowerCase()} voice.` : "";
  const accentLine = accent ? `Speak ${language} with a ${accent.label} accent for the whole call.` : `Speak ${language}.`;
  return `${voiceLine} ${accentLine} ${officeHoursSpeech(input.afterHours)} When the caller asks for a person, department, or extension, call transfer_to_approved_destination immediately and stop talking.`.replace(/\s+/g, " ").trim();
}

export function accentSelection(plan: Plan | null | undefined) {
  return accentsForPlan(plan).map((id) => accentById(id)).filter((accent): accent is Accent => Boolean(accent));
}
