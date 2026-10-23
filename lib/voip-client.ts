import crypto from "crypto";
import { clientEmail, personName, readVoipClientId } from "./client-profile";
import { callVoipms, getConnection } from "./carriers";
import { getDb } from "./db";
import { getEmergency } from "./e911";
import { regionAllowed } from "./places";
import { getSubaccount, linkSubaccountClient } from "./voip-account";

type ClientRow = { user_id: number; client_id: string; email: string; password: string; last_message: string; updated_at: string };

function clientPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function countryName(country: string) {
  return country === "CA" ? "Canada" : "United States";
}

export function getVoipClient(userId: number) {
  return getDb().prepare("SELECT * FROM voip_clients WHERE user_id = ?").get(userId) as ClientRow | undefined;
}

function saveClient(row: { userId: number; clientId: string; email: string; password: string; message: string }) {
  getDb().prepare(
    `INSERT INTO voip_clients (user_id, client_id, email, password, last_message, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET client_id = excluded.client_id, email = excluded.email, password = excluded.password, last_message = excluded.last_message, updated_at = excluded.updated_at`,
  ).run(row.userId, row.clientId, row.email, row.password, row.message.slice(0, 400), new Date().toISOString());
}

function note(userId: number, message: string) {
  getDb().prepare("UPDATE voip_clients SET last_message = ?, updated_at = ? WHERE user_id = ?").run(message.slice(0, 400), new Date().toISOString(), userId);
}

function profileFor(userId: number) {
  const user = getDb().prepare("SELECT name, email FROM users WHERE id = ? AND role = 'customer'").get(userId) as { name: string; email: string } | undefined;
  if (!user) return { ok: false as const, message: "That customer was not found." };
  const emergency = getEmergency(userId);
  const config = getConnection("voipms").public;
  const country = emergency?.country || (config.client_country === "CA" ? "CA" : config.client_country === "US" ? "US" : "");
  const state = (emergency?.state || config.client_state || "").toUpperCase();
  const city = emergency?.city || config.client_city || "";
  const address = emergency ? `${emergency.street_number} ${emergency.street_name}`.trim() : config.client_address || "";
  const zip = emergency?.zip || config.client_zip || "";
  const phone = (config.client_phone || "").replace(/\D/g, "").slice(0, 10);
  const email = clientEmail(userId, user.email, config.client_email_domain || "");
  if (!country || !regionAllowed(country, state) || !city || !address || !zip || phone.length < 10) {
    return { ok: false as const, message: "Add a fallback phone and address under VoIP.ms connections, or save this customer's emergency address, before the client account can be created." };
  }
  const name = personName(user.name);
  return {
    ok: true as const,
    profile: { ...name, address, city, state, country, countryName: countryName(country), zip, phone, email },
  };
}

async function connectDid(did: string, account: string) {
  const result = await callVoipms("connectDID", {
    did,
    account,
    monthly: "0",
    setup: "0",
    minute: "0",
    dont_charge_setup: "true",
    dont_charge_monthly: "true",
  });
  if (result.ok || /already|connect|duplicate/i.test(result.status)) return "";
  return result.status;
}

export async function syncCustomerDids(userId: number) {
  const client = getVoipClient(userId);
  const sub = getSubaccount(userId);
  if (!client?.client_id) return { ok: false, message: "The client account is not ready." };
  if (!sub?.account) {
    const message = `Client ${client.client_id} is linked. A line account is created when the first number is bought.`;
    note(userId, message);
    return { ok: true, message };
  }
  const linked = await linkSubaccountClient(userId, client.client_id);
  const dids = getDb().prepare("SELECT did FROM phone_lines WHERE user_id = ?").all(userId) as { did: string }[];
  const problems: string[] = [];
  if (!linked.ok) problems.push(linked.message);
  for (const line of dids) {
    if (!sub.locked) {
      const routed = await callVoipms("setDIDRouting", { did: line.did, routing: `account:${sub.account}` });
      if (!routed.ok) problems.push(`${line.did} routing ${routed.status}`);
    }
    const connected = await connectDid(line.did, sub.account);
    if (connected) problems.push(`${line.did} ${connected}`);
  }
  const message = problems.length ? problems.join(" ").slice(0, 400) : `Client ${client.client_id} is linked. ${dids.length} number${dids.length === 1 ? "" : "s"} use this customer's line account.`;
  note(userId, message);
  return { ok: problems.length === 0, message };
}

export async function ensureVoipClient(userId: number, refresh = false): Promise<{ ok: true; clientId: string } | { ok: false; message: string }> {
  const connection = getConnection("voipms");
  if (!connection.enabled || !connection.secret || !connection.public.api_username) {
    return { ok: false, message: "VoIP.ms is not connected, so a client account was not created." };
  }
  const existing = getVoipClient(userId);
  const built = profileFor(userId);
  if (existing?.client_id && !refresh) return { ok: true, clientId: existing.client_id };
  if (!built.ok) {
    if (existing) note(userId, built.message);
    return built;
  }
  const { profile } = built;
  if (existing?.client_id && existing.password) {
    const updated = await callVoipms("setClient", {
      client: existing.client_id,
      email: existing.email || profile.email,
      password: existing.password,
      firstname: profile.first,
      lastname: profile.last,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      country: profile.countryName,
      zip: profile.zip,
      phone_number: profile.phone,
    });
    const message = updated.ok ? `Client ${existing.client_id} is linked.` : `VoIP.ms did not update client ${existing.client_id} (${updated.status}).`;
    note(userId, message);
    if (updated.ok) await syncCustomerDids(userId);
    return updated.ok ? { ok: true, clientId: existing.client_id } : { ok: false, message };
  }
  const listed = await callVoipms("getClients", { client: profile.email });
  let clientId = listed.ok ? readVoipClientId(listed.body) : "";
  let password = existing?.password || "";
  if (!clientId) {
    password = clientPassword();
    const created = await callVoipms("signupClient", {
      firstname: profile.first,
      lastname: profile.last,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      country: profile.countryName,
      zip: profile.zip,
      phone_number: profile.phone,
      email: profile.email,
      confirm_email: profile.email,
      password,
      confirm_password: password,
      activate: "1",
    });
    clientId = readVoipClientId(created.body);
    if (!created.ok || !clientId) {
      const message = `VoIP.ms did not create a client account (${created.status}).`;
      saveClient({ userId, clientId: "", email: profile.email, password: "", message });
      return { ok: false, message };
    }
  }
  saveClient({ userId, clientId, email: profile.email, password, message: `Client ${clientId} is linked.` });
  await syncCustomerDids(userId);
  return { ok: true, clientId };
}
