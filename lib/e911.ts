import { callVoipms } from "./carriers";
import { customerMessage } from "./customer-message";
import { flagOn, getDb } from "./db";
import { regionAllowed } from "./places";

export type EmergencyAddress = {
  full_name: string;
  street_number: string;
  street_name: string;
  address_type: string;
  address_number: string;
  city: string;
  state: string;
  country: "US" | "CA";
  zip: string;
  language: "EN" | "FR";
};

export const unitTypes = [
  { value: "", label: "House or street address only" },
  { value: "APT", label: "Apartment" },
  { value: "STE", label: "Suite" },
  { value: "FL", label: "Floor" },
  { value: "UNIT", label: "Unit" },
  { value: "RM", label: "Room" },
  { value: "BLDG", label: "Building" },
];

type AddressRow = EmergencyAddress & { user_id: number };

export function parseEmergency(input: Record<string, string>): { ok: true; address: EmergencyAddress } | { ok: false; message: string } {
  const country = input.country === "CA" ? "CA" : input.country === "US" ? "US" : "";
  const zipRaw = (input.zip || "").trim().toUpperCase();
  const zip = country === "CA" ? zipRaw.replace(/\s+/g, "") : zipRaw.replace(/[^0-9]/g, "");
  const address: EmergencyAddress = {
    full_name: (input.full_name || "").trim().slice(0, 80),
    street_number: (input.street_number || "").replace(/\D/g, "").slice(0, 10),
    street_name: (input.street_name || "").trim().slice(0, 80),
    address_type: unitTypes.some((item) => item.value === input.address_type) ? input.address_type : "",
    address_number: (input.address_number || "").replace(/\D/g, "").slice(0, 10),
    city: (input.city || "").trim().slice(0, 80),
    state: (input.state || "").trim().toUpperCase().slice(0, 2),
    country: country === "CA" ? "CA" : "US",
    zip,
    language: input.language === "FR" ? "FR" : "EN",
  };
  if (!address.full_name) return { ok: false, message: "Enter the name emergency services should ask for." };
  if (!address.street_number) return { ok: false, message: "Enter the street number, using digits such as 1200." };
  if (!address.street_name) return { ok: false, message: "Enter the street name." };
  if (!address.city) return { ok: false, message: "Choose a city." };
  if (!country) return { ok: false, message: "Choose the United States or Canada." };
  if (!regionAllowed(country, address.state)) return { ok: false, message: "Choose a state or province." };
  if (country === "US" && !/^\d{5}(\d{4})?$/.test(address.zip)) return { ok: false, message: "Enter a 5-digit ZIP code." };
  if (country === "CA" && !/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(address.zip)) return { ok: false, message: "Enter a Canadian postal code." };
  if (input.address_number && !address.address_number) return { ok: false, message: "The apartment or suite number should be digits." };
  if (address.address_number && !address.address_type) return { ok: false, message: "Choose apartment, suite, floor, unit, room, or building." };
  return { ok: true, address };
}

export function formatAddress(address: EmergencyAddress) {
  const unit = address.address_type && address.address_number ? ` ${address.address_type} ${address.address_number}` : "";
  const zipText = typeof address.zip === "string" ? address.zip : "";
  const zip = address.country === "CA" ? `${zipText.slice(0, 3)} ${zipText.slice(3)}`.trim() : zipText;
  return `${address.full_name || ""}, ${address.street_number || ""} ${address.street_name || ""}${unit}, ${address.city || ""}, ${address.state || ""} ${zip}`.replace(/\s+,/g, ",").trim();
}

export function getEmergency(userId: number): EmergencyAddress | null {
  const row = getDb().prepare("SELECT * FROM emergency_addresses WHERE user_id = ?").get(userId) as AddressRow | undefined;
  if (!row) return null;
  return {
    full_name: row.full_name,
    street_number: row.street_number,
    street_name: row.street_name,
    address_type: row.address_type,
    address_number: row.address_number,
    city: row.city,
    state: row.state,
    country: row.country === "CA" ? "CA" : "US",
    zip: row.zip,
    language: row.language === "FR" ? "FR" : "EN",
  };
}

export function saveEmergency(userId: number, address: EmergencyAddress) {
  getDb().prepare(
    `INSERT INTO emergency_addresses (user_id, full_name, street_number, street_name, address_type, address_number, city, state, country, zip, language, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       full_name = excluded.full_name, street_number = excluded.street_number, street_name = excluded.street_name,
       address_type = excluded.address_type, address_number = excluded.address_number, city = excluded.city,
       state = excluded.state, country = excluded.country, zip = excluded.zip, language = excluded.language, updated_at = excluded.updated_at`,
  ).run(userId, address.full_name, address.street_number, address.street_name, address.address_type, address.address_number, address.city, address.state, address.country, address.zip, address.language, new Date().toISOString());
}

function carrierParams(address: EmergencyAddress, did: string, update: boolean) {
  const params: Record<string, string> = {
    did,
    full_name: address.full_name,
    street_number: address.street_number,
    street_name: address.street_name,
    city: address.city,
    state: address.state,
    country: address.country,
    address_type: address.address_type,
    address_number: address.address_number,
  };
  params[update ? "zip_code" : "zip"] = address.zip;
  if (address.country === "CA") params.language = address.language;
  return params;
}

function plainStatus(status: string) {
  const known: Record<string, string> = {
    not_configured: "VoIP.ms is not connected, so the emergency address was saved here.",
    invalid_address: "The phone company did not accept this address.",
    missing_did: "This number is not on the phone company account yet.",
    invalid_did: "This number is not on the phone company account yet.",
    e911_pending: "The phone company is still checking this address.",
  };
  return known[status] || `The phone company returned ${status}.`;
}

function didForCarrier(did: string) {
  const digits = did.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

type LineE911 = { id: number; did: string; e911_json: string; e911_status: string };

function readStored(raw: string): EmergencyAddress | null {
  try {
    const parsed = parseEmergency(JSON.parse(raw) as Record<string, string>);
    return parsed.ok ? parsed.address : null;
  } catch {
    return null;
  }
}

export async function sendEmergency(lineId: number) {
  const line = getDb().prepare("SELECT id, user_id, did, e911_json, e911_status FROM phone_lines WHERE id = ?").get(lineId) as (LineE911 & { user_id: number }) | undefined;
  if (!line) return { ok: false, message: "That line was not found." };
  const address = readStored(line.e911_json) || getEmergency(line.user_id);
  if (!address) {
    getDb().prepare("UPDATE phone_lines SET e911_status = 'missing', e911_message = ? WHERE id = ?").run("This number has no emergency address yet.", line.id);
    return { ok: false, message: "This number has no emergency address yet." };
  }
  getDb().prepare("UPDATE phone_lines SET e911_json = ? WHERE id = ?").run(JSON.stringify(address), line.id);
  if (!flagOn("numbers.live_order")) {
    const changed = line.e911_status === "sent" || line.e911_status === "done";
    const message = changed
      ? "The address changed here. Buying numbers is turned off, so the phone company was not updated."
      : "Saved. It is sent to the phone company when a number is bought.";
    getDb().prepare("UPDATE phone_lines SET e911_status = ?, e911_message = ? WHERE id = ?").run(changed ? "needs_person" : "saved", message, line.id);
    return { ok: !changed, message };
  }
  const did = didForCarrier(line.did);
  const checked = await callVoipms("e911Validate", carrierParams(address, did, false));
  if (!checked.ok) {
    const detail = plainStatus(checked.status);
    console.error(`[sauticall] e911 ${detail}`);
    getDb().prepare("UPDATE phone_lines SET e911_status = 'needs_person', e911_message = ? WHERE id = ?").run(detail, line.id);
    return { ok: false, message: customerMessage(detail, "The emergency address was saved. The team will finish sending it.") };
  }
  const update = line.e911_status === "sent" || line.e911_status === "done";
  let result = await callVoipms(update ? "e911Update" : "e911Provision", carrierParams(address, did, update));
  if (!result.ok && update) result = await callVoipms("e911Provision", carrierParams(address, did, false));
  const detail = result.ok ? "Emergency address sent to the phone company." : plainStatus(result.status);
  if (!result.ok) console.error(`[sauticall] e911 ${detail}`);
  getDb().prepare("UPDATE phone_lines SET e911_status = ?, e911_message = ? WHERE id = ?").run(result.ok ? "sent" : "needs_person", detail, line.id);
  return { ok: result.ok, message: result.ok ? detail : customerMessage(detail, "The emergency address was saved. The team will finish sending it.") };
}

export async function syncEmergency(userId: number) {
  const lines = getDb().prepare("SELECT id FROM phone_lines WHERE user_id = ?").all(userId) as { id: number }[];
  if (lines.length === 0) return { ok: true, message: "Emergency address saved. It will be sent when a number is bought." };
  let last = { ok: true, message: "Emergency address saved." };
  for (const line of lines) last = await sendEmergency(line.id);
  return last;
}

export function markEmergencyDone(lineId: number, note: string) {
  const line = getDb().prepare("SELECT id FROM phone_lines WHERE id = ?").get(lineId) as { id: number } | undefined;
  if (!line) return { ok: false, message: "That line was not found." };
  const message = note.trim().slice(0, 400) || "Marked done on the phone company.";
  getDb().prepare("UPDATE phone_lines SET e911_status = 'done', e911_message = ? WHERE id = ?").run(message, lineId);
  return { ok: true, message };
}
