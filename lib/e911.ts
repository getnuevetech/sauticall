import { callVoipms } from "./carriers";
import { customerMessage } from "./customer-message";
import { flagOn, getDb } from "./db";
import { emergencyCarrierParams, parseEmergency, type EmergencyAddress } from "./e911-address";

export { emergencyCarrierParams, formatAddress, parseEmergency, unitTypes, type EmergencyAddress } from "./e911-address";

type AddressRow = EmergencyAddress & { user_id: number };

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
  const checked = await callVoipms("e911Validate", emergencyCarrierParams(address, did));
  if (!checked.ok) {
    const detail = `${plainStatus(checked.status)} ${checked.message}`.trim();
    console.error(`[sauticall] e911 ${detail}`);
    const { recordFailure } = await import("./failure-log");
    recordFailure({ area: "emergency", userId: line.user_id, subject: line.did, detail });
    getDb().prepare("UPDATE phone_lines SET e911_status = 'needs_person', e911_message = ? WHERE id = ?").run(detail.slice(0, 400), line.id);
    return { ok: false, message: customerMessage(plainStatus(checked.status), "The emergency address was saved. The team will finish sending it.") };
  }
  const update = line.e911_status === "sent" || line.e911_status === "done";
  let result = await callVoipms(update ? "e911Update" : "e911Provision", emergencyCarrierParams(address, did));
  if (!result.ok && update) result = await callVoipms("e911Provision", emergencyCarrierParams(address, did));
  const detail = result.ok ? "Emergency address sent to the phone company." : `${plainStatus(result.status)} ${result.message}`.trim();
  if (!result.ok) {
    console.error(`[sauticall] e911 ${detail}`);
    const { recordFailure } = await import("./failure-log");
    recordFailure({ area: "emergency", userId: line.user_id, subject: line.did, detail });
  }
  getDb().prepare("UPDATE phone_lines SET e911_status = ?, e911_message = ? WHERE id = ?").run(result.ok ? "sent" : "needs_person", detail.slice(0, 400), line.id);
  return { ok: result.ok, message: result.ok ? "Emergency address sent to the phone company." : customerMessage(plainStatus(result.status), "The emergency address was saved. The team will finish sending it.") };
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
