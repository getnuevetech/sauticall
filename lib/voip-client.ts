import crypto from "crypto";
import { fundNeedsRetry, fundRetryDetail, planFundAmount, readClientBalance } from "./client-funding";
import { recordFailure, updateFailure } from "./failure-log";
import { finishAfterResponse } from "./later";
import { accountClientProfile, clientEmail, readVoipClientId } from "./client-profile";
import { callVoipms, getConnection, VOIPMS_WRITE_MS } from "./carriers";
import { flagOn, getDb, readDoc } from "./db";
import type { Plan } from "./types";
import { getEmergency } from "./e911";
import { regionAllowed } from "./places";
import { ensureSubaccount, getSubaccount, linkSubaccountClient } from "./voip-account";

type ClientRow = { user_id: number; client_id: string; email: string; password: string; last_message: string; updated_at: string; funded_cents?: number; funded_plan?: string };

function clientPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
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
  const user = getDb().prepare("SELECT name, email, phone FROM users WHERE id = ? AND role = 'customer'").get(userId) as { name: string; email: string; phone: string } | undefined;
  if (!user) return { ok: false as const, message: "That customer was not found." };
  const emergency = getEmergency(userId);
  const config = getConnection("voipms").public;
  const built = accountClientProfile({
    name: user.name,
    phone: user.phone,
    address: emergency ? {
      country: emergency.country,
      state: emergency.state,
      city: emergency.city,
      address: `${emergency.street_number} ${emergency.street_name}`.trim(),
      zip: emergency.zip,
    } : null,
    fallback: { country: config.client_country, state: config.client_state, city: config.client_city, address: config.client_address, zip: config.client_zip, phone: config.client_phone },
  });
  if (!built.ok) return built;
  const place = built.profile;
  if (!regionAllowed(place.country, place.state)) place.state = place.country === "CA" ? "ON" : "TX";
  const email = clientEmail(userId, user.email, config.client_email_domain || "");
  if (!email) return { ok: false as const, message: "Set a client email domain on the VoIP.ms connection. The customer's email is not sent to VoIP.ms." };
  return { ok: true as const, profile: { ...place, email } };
}

async function connectDid(did: string, account: string) {
  const result = await callVoipms("connectDID", {
    did,
    account,
    monthly: "0.00",
    setup: "0.00",
    minute: "0.00",
    dont_charge_setup: "true",
    dont_charge_monthly: "true",
  }, VOIPMS_WRITE_MS);
  if (result.ok || /already|connect|duplicate/i.test(result.status)) return "";
  return result.status;
}

export async function billDidToClient(did: string, account: string, fees: { monthly: string; setup: string; minute: string }, alreadyCharged: boolean) {
  const result = await callVoipms("connectDID", {
    did,
    account,
    monthly: fees.monthly,
    setup: fees.setup,
    minute: fees.minute,
    ...(alreadyCharged ? { dont_charge_setup: "true", dont_charge_monthly: "true" } : {}),
  }, VOIPMS_WRITE_MS);
  if (result.ok || /already|connect|duplicate/i.test(`${result.status} ${result.message}`)) return "";
  return result.message || result.status;
}

export async function readFundedBalance(clientId: string) {
  const current = await callVoipms("getResellerBalance", { client: clientId });
  return current.ok ? readClientBalance(current.body) : null;
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
  const existing = getVoipClient(userId);
  if (existing?.client_id && !refresh) return { ok: true, clientId: existing.client_id };
  const connection = getConnection("voipms");
  if (!connection.enabled || !connection.secret || !connection.public.api_username) {
    const message = "VoIP.ms is not connected, so a client account was not created.";
    if (!existing?.client_id) saveClient({ userId, clientId: "", email: "", password: "", message });
    return { ok: false, message };
  }
  const built = profileFor(userId);
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
      country: profile.country,
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
      country: profile.country,
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

function creditFor(planName: string) {
  const plans = readDoc<Plan[]>("plans") || [];
  const plan = plans.find((item) => item.name.trim().toLowerCase() === planName.trim().toLowerCase());
  return { plan: plan?.name || planName.trim(), amount: planFundAmount(plan?.carrierCredit) };
}

export async function fundPaidPlan(userId: number, planName: string) {
  if (!flagOn("billing.fund_client")) return { ok: true as const, message: "Funding client accounts is turned off." };
  const { plan, amount } = creditFor(planName);
  if (!amount) {
    const message = plan ? `${plan} has no phone-company balance set, so nothing was added.` : "The paid plan has no phone-company balance set, so nothing was added.";
    if (getVoipClient(userId)) note(userId, message);
    return { ok: false as const, message };
  }
  const client = await ensureVoipClient(userId);
  if (!client.ok) return client;
  const existing = getVoipClient(userId);
  if ((existing?.funded_cents || 0) > 0) return { ok: true as const, message: `A phone-company balance of $${((existing?.funded_cents || 0) / 100).toFixed(2)} is already on client ${client.clientId}.` };
  const current = await callVoipms("getResellerBalance", { client: client.clientId });
  const balance = current.ok ? readClientBalance(current.body) : null;
  if (balance != null && balance >= amount) {
    getDb().prepare("UPDATE voip_clients SET funded_cents = ?, funded_plan = ? WHERE user_id = ?").run(Math.round(amount * 100), plan, userId);
    const message = `Client ${client.clientId} already had $${balance.toFixed(2)}, so the $${amount.toFixed(2)} ${plan} balance was not added again.`;
    note(userId, message);
    return { ok: true as const, message };
  }
  const paid = await callVoipms("addPayment", {
    client: client.clientId,
    payment: amount.toFixed(2),
    description: `SautiCall ${plan} plan balance`,
  });
  if (!paid.ok) {
    const message = `VoIP.ms did not add the $${amount.toFixed(2)} ${plan} balance (${paid.message}).`;
    note(userId, message);
    return { ok: false as const, message };
  }
  getDb().prepare("UPDATE voip_clients SET funded_cents = ?, funded_plan = ? WHERE user_id = ?").run(Math.round(amount * 100), plan, userId);
  const message = `Client ${client.clientId} has a $${amount.toFixed(2)} balance for ${plan}.`;
  note(userId, message);
  return { ok: true as const, message };
}

export async function fundPaidPlanWithRetry(userId: number, planName: string) {
  const first = await fundPaidPlan(userId, planName).catch((error: unknown) => ({
    ok: false as const,
    message: error instanceof Error ? error.message : "The plan balance was not added to the VoIP.ms client.",
  }));
  if (first.ok) return first;
  if (!fundNeedsRetry(first.message)) {
    recordFailure({ area: "client", userId, subject: planName, detail: `${first.message} An administrator has to fix this.` });
    return first;
  }
  const failureId = recordFailure({ area: "client", userId, subject: planName, detail: first.message });
  const second = await fundPaidPlan(userId, planName).catch((error: unknown) => ({
    ok: false as const,
    message: error instanceof Error ? error.message : "The plan balance was not added to the VoIP.ms client.",
  }));
  const detail = fundRetryDetail(first.message, second.ok, second.message);
  updateFailure(failureId, detail);
  return second.ok ? { ok: true as const, message: detail } : { ok: false as const, message: detail };
}

export async function ensureOutstandingClients() {
  const rows = getDb().prepare(
    `SELECT u.id FROM users u
     LEFT JOIN voip_clients c ON c.user_id = u.id
     WHERE u.role = 'customer' AND (c.user_id IS NULL OR c.client_id = '')`,
  ).all() as { id: number }[];
  for (const row of rows) await ensureVoipClient(row.id);
}

let clientSweepStarted = false;

export function scheduleOutstandingClients() {
  if (clientSweepStarted) return;
  clientSweepStarted = true;
  finishAfterResponse(() => ensureOutstandingClients());
}

export async function provisionCustomer(userId: number) {
  const client = await ensureVoipClient(userId);
  if (!client.ok) return client;
  const line = await ensureSubaccount(userId, client.clientId);
  if (!line.ok) {
    note(userId, line.message);
    return { ok: false as const, message: line.message };
  }
  await syncCustomerDids(userId);
  return { ok: true as const, clientId: client.clientId };
}
