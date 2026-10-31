"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { companyMatches } from "@/lib/phone-ops";
import { permissionForDocument } from "@/lib/access-catalog";
import { audit, getDb, writeDoc } from "@/lib/db";
import { normalizePlans } from "@/lib/plan-features";
import type { Plan } from "@/lib/types";
import { readGatewaySecret, stripePublishableMatches, stripeSecretMatches, writeGatewaySecret } from "@/lib/payment-keys";

async function staff(permission: string) {
  return requirePermission(permission);
}

export async function saveDocument(key: string, json: string) {
  const permission = permissionForDocument(key);
  if (!permission) redirect("/admin/denied");
  const user = await staff(permission);
  const value = JSON.parse(json) as unknown;
  const exists = getDb().prepare("SELECT key FROM documents WHERE key = ?").get(key);
  if (!exists) {
    getDb().prepare("INSERT INTO documents (key, json, updated_at) VALUES (?, ?, ?)").run(key, JSON.stringify(value), new Date().toISOString());
    audit(user.email, "document.create", key);
  } else {
    writeDoc(key, value, user.email);
  }
  revalidatePath("/", "layout");
}

export async function savePlans(json: string) {
  const user = await staff("content.plans");
  let parsed: Plan[];
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) throw new Error("bad");
    parsed = value as Plan[];
  } catch {
    redirect("/admin/content/plans?error=Those%20plans%20could%20not%20be%20read.");
  }
  const names = parsed.map((plan) => String(plan.name || "").trim());
  if (names.some((name) => !name) || new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    redirect("/admin/content/plans?error=Give%20every%20plan%20its%20own%20name.");
  }
  const plans = normalizePlans(parsed.map((plan, index) => ({ ...plan, name: names[index] })));
  writeDoc("plans", plans, user.email);
  revalidatePath("/", "layout");
  redirect("/admin/content/plans?saved=1");
}

export async function saveBundles(json: string) {
  const user = await staff("content.bundles");
  let incoming: unknown[];
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) throw new Error("bad");
    incoming = value;
  } catch {
    redirect("/admin/content/minute_bundles?error=Those%20bundles%20could%20not%20be%20read.");
  }
  const row = getDb().prepare("SELECT json FROM documents WHERE key = 'minute_bundles'").get() as { json: string } | undefined;
  const { applyBundleEdits, normalizeBundle } = await import("@/lib/catalog");
  let stored: unknown[] = [];
  try {
    const parsed = JSON.parse(row?.json || "[]") as unknown;
    stored = Array.isArray(parsed) ? parsed : [];
  } catch {
    stored = [];
  }
  const result = applyBundleEdits(stored.map((item) => normalizeBundle(item as { name?: string; minutes?: number; price?: number; enabled?: boolean })), incoming as { name?: string; minutes?: number; price?: number; enabled?: boolean }[]);
  if (!result.ok) redirect(`/admin/content/minute_bundles?error=${encodeURIComponent(result.message)}`);
  writeDoc("minute_bundles", result.bundles, user.email);
  revalidatePath("/", "layout");
  redirect("/admin/content/minute_bundles?saved=1");
}

export async function saveGateway(formData: FormData) {
  const user = await staff("settings.payments");
  const id = Number(formData.get("id") || 0);
  const provider = String(formData.get("provider_key") || "").trim().toLowerCase();
  const payload = {
    name: String(formData.get("name") || "").trim(),
    provider_key: provider,
    public_label: String(formData.get("public_label") || "").trim(),
    enabled: formData.get("enabled") === "on" ? 1 : 0,
    priority: Number(formData.get("priority") || 100),
    mode: String(formData.get("mode") || "test") === "live" ? "live" : "test",
    currencies: String(formData.get("currencies") || "USD").trim().toUpperCase(),
  };
  if (!payload.name || !payload.public_label) return { error: "Add a name for your team and the name customers see." };
  if (provider !== "stripe" && provider !== "paypal" && provider !== "square") return { error: "Choose Stripe, PayPal, or Square." };
  const existing = id
    ? getDb().prepare("SELECT provider_key, secret, config_json FROM gateways WHERE id = ?").get(id) as { provider_key: string; secret: string; config_json: string } | undefined
    : undefined;
  if (id && !existing) return { error: "That way to pay was not found." };
  const previous = readGatewaySecret(existing?.secret || "");
  const sameProvider = existing?.provider_key === provider;
  const postedKey = String(formData.get("secret_key") || "").trim();
  const postedWebhook = String(formData.get("webhook_secret") || "").trim();
  const key = postedKey || (sameProvider ? previous.key : "");
  const webhook = provider === "stripe" ? postedWebhook || (sameProvider ? previous.webhook : "") : "";
  const config = {
    publishable_key: provider === "stripe" ? String(formData.get("publishable_key") || "").trim() : "",
    client_id: provider === "paypal" ? String(formData.get("client_id") || "").trim() : "",
    application_id: provider === "square" ? String(formData.get("application_id") || "").trim() : "",
    location_id: provider === "square" ? String(formData.get("location_id") || "").trim() : "",
  };
  if (provider === "stripe") {
    if (!config.publishable_key || !key) return { error: "Stripe needs the publishable key and the secret key." };
    if (!stripePublishableMatches(payload.mode, config.publishable_key) || !stripeSecretMatches(payload.mode, key)) {
      return { error: payload.mode === "live" ? "Real Stripe payments need keys that start with pk_live_ and sk_live_." : "Practice Stripe payments need keys that start with pk_test_ and sk_test_." };
    }
  }
  if (provider === "paypal" && (!config.client_id || !key)) return { error: "PayPal needs the client ID and the secret." };
  if (provider === "square" && (!config.application_id || !config.location_id || !key)) return { error: "Square needs the application ID, location ID, and access token." };
  const secret = writeGatewaySecret({ key, webhook });
  let savedId = id;
  if (id) {
    getDb()
      .prepare("UPDATE gateways SET name=?, provider_key=?, public_label=?, enabled=?, priority=?, mode=?, currencies=?, config_json=?, secret=? WHERE id=?")
      .run(payload.name, payload.provider_key, payload.public_label, payload.enabled, payload.priority, payload.mode, payload.currencies, JSON.stringify(config), secret, id);
    audit(user.email, "gateway.update", String(id));
  } else {
    const info = getDb()
      .prepare("INSERT INTO gateways (name, provider_key, public_label, enabled, priority, mode, currencies, config_json, secret_ref, secret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)")
      .run(payload.name, payload.provider_key, payload.public_label, payload.enabled, payload.priority, payload.mode, payload.currencies, JSON.stringify(config), secret);
    savedId = Number(info.lastInsertRowid);
    audit(user.email, "gateway.create", String(savedId));
  }
  redirect(`/admin/gateways?id=${savedId}&saved=1`);
}

export async function testGateway(formData: FormData) {
  const user = await staff("settings.payments");
  const id = Number(formData.get("id"));
  const { testGateway: check } = await import("@/lib/payments");
  const result = await check(id);
  audit(user.email, "gateway.test", `${id}:${result.ok ? "ok" : "failed"}`);
  redirect(`/admin/gateways?id=${id}`);
}

export async function setGatewayEnabled(formData: FormData) {
  const user = await staff("settings.payments");
  const id = Number(formData.get("id"));
  const enabled = Number(formData.get("enabled"));
  getDb().prepare("UPDATE gateways SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  audit(user.email, enabled ? "gateway.enable" : "gateway.disable", String(id));
  redirect(`/admin/gateways?id=${id}`);
}

export async function saveConnection(formData: FormData) {
  const user = await staff("settings.connections");
  const provider = String(formData.get("provider") || "");
  if (provider !== "voipms" && provider !== "3cx") redirect("/admin/connections");
  const { getConnection, saveConnection: persist } = await import("@/lib/carriers");
  const enabled = formData.get("enabled") === "on";
  const secret = String(formData.get("secret") || "");
  if (provider === "voipms") {
    persist(provider, enabled, {
      api_username: String(formData.get("api_username") || "").trim(),
      endpoint: String(formData.get("endpoint") || "https://voip.ms/api/v1/rest.php").trim(),
      routing: String(formData.get("routing") || "").trim(),
      pop: String(formData.get("pop") || "").trim(),
      dialtime: String(formData.get("dialtime") || "60").trim(),
      cnam: formData.get("cnam") === "on" ? "1" : "0",
      billing_type: String(formData.get("billing_type") || "1") === "2" ? "2" : "1",
      device_type: String(formData.get("device_type") || "1").trim() || "1",
      lock_international: formData.get("lock_international") === "on" ? "1" : "0",
      international_route: String(formData.get("international_route") || "1") === "2" ? "2" : "1",
      music_on_hold: String(formData.get("music_on_hold") || "default").trim() || "default",
      allowed_codecs: (await import("@/lib/line-codecs")).lineCodecs(String(formData.get("allowed_codecs") || "")),
      dtmf_mode: String(formData.get("dtmf_mode") || "auto").trim() || "auto",
      nat: String(formData.get("nat") || "yes").trim() || "yes",
      client_email_domain: String(getConnection("voipms").public.client_email_domain || ""),
      client_phone: String(formData.get("client_phone") || "").replace(/\D/g, "").slice(0, 10),
      client_address: String(formData.get("client_address") || "").trim().slice(0, 80),
      client_city: String(formData.get("client_city") || "").trim().slice(0, 80),
      client_state: String(formData.get("client_state") || "").trim().toUpperCase().slice(0, 2),
      client_country: String(formData.get("client_country") || "") === "CA" ? "CA" : "US",
      client_zip: String(formData.get("client_zip") || "").trim().toUpperCase().slice(0, 10),
      sms_did: (await import("@/lib/sms-number")).smsDestination(String(formData.get("sms_did") || "")),
    }, secret);
  } else {
    persist(provider, enabled, {
      base_url: String(formData.get("base_url") || "").trim(),
      client_id: String(formData.get("client_id") || "").trim(),
      trunk_template: String(formData.get("trunk_template") || "GenericSIPTrunk.pv.xml").trim() || "GenericSIPTrunk.pv.xml",
    }, secret);
  }
  audit(user.email, "connection.save", provider);
  redirect(`/admin/connections?provider=${provider}&saved=1`);
}

export async function savePlacesKey(formData: FormData) {
  const user = await staff("settings.connections");
  const { savePlacesKey: persist } = await import("@/lib/google-places");
  persist(formData.get("enabled") === "on", String(formData.get("secret") || ""));
  audit(user.email, "connection.save", "google");
  redirect("/admin/connections?provider=voipms&saved=places");
}

export async function testConnection(formData: FormData) {
  const user = await staff("settings.connections");
  const provider = String(formData.get("provider") || "");
  const { test3cx, testVoipms } = await import("@/lib/carriers");
  const result = provider === "3cx" ? await test3cx() : await testVoipms();
  audit(user.email, "connection.test", `${provider}:${result.ok ? "ok" : "failed"}`);
  redirect(`/admin/connections?provider=${provider === "3cx" ? "3cx" : "voipms"}`);
}

export async function orderSavedNumber(formData: FormData) {
  const user = await staff("inbox.requests");
  const { flagOn, getDb: database } = await import("@/lib/db");
  if (!flagOn("numbers.live_order")) redirect("/admin/requests?error=Live%20number%20ordering%20is%20turned%20off.");
  const id = Number(formData.get("id"));
  const row = database().prepare("SELECT user_id, payload, kind, status FROM account_requests WHERE id = ?").get(id) as { user_id: number; payload: string; kind: string; status: string } | undefined;
  if (!row || row.kind !== "number") redirect("/admin/requests?error=That%20request%20is%20not%20a%20number.");
  if (row.status === "ordering") redirect("/admin/requests?error=This%20number%20is%20already%20being%20bought.");
  let payload: { did?: string; monthly?: string } = {};
  try {
    payload = JSON.parse(row.payload) as { did?: string; monthly?: string };
  } catch {
    payload = {};
  }
  if (!payload.did) redirect("/admin/requests?error=This%20request%20has%20no%20specific%20number%20to%20order.");
  const did = payload.did;
  const monthly = payload.monthly;
  database().prepare("UPDATE account_requests SET status = ?, staff_note = ? WHERE id = ?").run("ordering", "Buying this number on the phone-company account.", id);
  const { finishAfterResponse } = await import("@/lib/later");
  const buyerId = row.user_id;
  const actor = user.email;
  finishAfterResponse(async () => {
    const { purchaseNumber } = await import("@/lib/lines");
    const { carrierDidRef } = await import("@/lib/number-order");
    const { audit: record, getDb: db } = await import("@/lib/db");
    try {
      const result = await purchaseNumber({ requestId: id, userId: buyerId, did, monthly });
      const status = result.ok || result.pending ? "ordered" : "exception";
      const ref = result.ok ? carrierDidRef(did) : "";
      db().prepare("UPDATE account_requests SET status = ?, staff_note = ?, provider_ref = ? WHERE id = ?").run(status, (result.detail || result.message).slice(0, 400), ref, id);
      record(actor, "request.order", `${id}:${status}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The purchase could not be finished.";
      db().prepare("UPDATE account_requests SET status = 'exception', staff_note = ? WHERE id = ?").run(detail.slice(0, 400), id);
      record(actor, "request.order", `${id}:exception`);
    }
  });
  redirect("/admin/requests");
}

export async function refreshPortStatus(formData: FormData) {
  const user = await staff("inbox.requests");
  const id = Number(formData.get("id"));
  const { getDb: database } = await import("@/lib/db");
  const row = database().prepare("SELECT provider_ref, kind FROM account_requests WHERE id = ?").get(id) as { provider_ref: string; kind: string } | undefined;
  if (!row || row.kind !== "port" || !row.provider_ref) redirect("/admin/requests?error=This%20transfer%20has%20no%20carrier%20reference%20yet.");
  const { portStatus } = await import("@/lib/carriers");
  const result = await portStatus(row.provider_ref);
  database().prepare("UPDATE account_requests SET staff_note = ? WHERE id = ?").run(result.ok ? `Carrier status: ${result.status}` : result.message, id);
  if (!result.ok) {
    const { recordFailure } = await import("@/lib/failure-log");
    recordFailure({ area: "transfer", subject: row.provider_ref, detail: result.message });
  }
  audit(user.email, "request.port.refresh", String(id));
  redirect("/admin/requests");
}

export async function setRequestStatus(formData: FormData) {
  const user = await staff("inbox.requests");
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") || "requested");
  const note = String(formData.get("staff_note") || "").slice(0, 400);
  const allowed = new Set(["requested", "ordering", "submitted", "ordered", "completed", "exception", "cancelled"]);
  if (!allowed.has(status)) redirect("/admin/requests?error=Unknown%20status.");
  const row = getDb().prepare("SELECT kind, payload, provider_ref FROM account_requests WHERE id = ?").get(id) as { kind: string; payload: string; provider_ref: string } | undefined;
  if (!row) redirect("/admin/requests?error=That%20request%20was%20not%20found.");
  let providerRef = row.provider_ref;
  if (row.kind === "number" && (status === "ordered" || status === "completed")) {
    let did = "";
    try {
      did = String((JSON.parse(row.payload) as { did?: string }).did || "");
    } catch {
      did = "";
    }
    const { lookupOwnedDid } = await import("@/lib/carriers");
    const { carrierDidRef } = await import("@/lib/number-order");
    const owned = await lookupOwnedDid(did);
    if (!owned.ok) redirect(`/admin/requests?error=${encodeURIComponent(`VoIP.ms could not be checked (${owned.message}). The status was not changed.`)}`);
    if (!owned.owned || !carrierDidRef(did)) redirect(`/admin/requests?error=${encodeURIComponent("VoIP.ms does not have this number. The status was not changed. Use Buy this number.")}`);
    providerRef = carrierDidRef(did);
  }
  getDb().prepare("UPDATE account_requests SET status = ?, staff_note = ?, provider_ref = ? WHERE id = ?").run(status, note, providerRef, id);
  audit(user.email, "request.status", `${id}:${status}`);
  redirect("/admin/requests");
}

export async function saveExtensionPlan(formData: FormData): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const user = await staff("settings.phone");
  const { extensionPlanFromFields } = await import("@/lib/extension-numbers");
  const { readExtensionPlan, shiftPendingExtensions } = await import("@/lib/extension-plan");
  const current = readExtensionPlan();
  const parsed = extensionPlanFromFields({
    start: String(formData.get("start") || ""),
    block: String(formData.get("block") || current.block),
    span: String(formData.get("span") || ""),
    ringStart: String(formData.get("ring_start") || ""),
    queueStart: String(formData.get("queue_start") || ""),
    groupSpan: String(formData.get("group_span") || ""),
  });
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const exists = getDb().prepare("SELECT key FROM documents WHERE key = ?").get("extension_plan");
  if (!exists) {
    getDb().prepare("INSERT INTO documents (key, json, updated_at) VALUES (?, ?, ?)").run("extension_plan", JSON.stringify(parsed.plan), new Date().toISOString());
    audit(user.email, "document.create", "extension_plan");
  } else {
    writeDoc("extension_plan", parsed.plan, user.email);
  }
  const moved = shiftPendingExtensions(parsed.plan);
  revalidatePath("/admin/phone");
  const shifted = moved.length ? ` ${moved.length} ${moved.length === 1 ? "person was" : "people were"} not on the phone system yet and now ${moved.length === 1 ? "starts" : "start"} at ${parsed.plan.start} or the next free number.` : "";
  return {
    ok: true,
    message: `Extension numbers saved. People start at ${parsed.plan.start}. Ring groups start at ${parsed.plan.ringStart}. Queues start at ${parsed.plan.queueStart}.${shifted}`,
  };
}

function ownedCompany(formData: FormData, ownerId: number, back: string) {
  const company = Number(formData.get("company"));
  if (!companyMatches(ownerId, company)) redirect(`${back}?error=${encodeURIComponent("That record is not in the selected company.")}`);
  return company;
}

export async function removePersonRecord(formData: FormData) {
  const user = await staff("settings.phone");
  const id = Number(formData.get("id"));
  const row = getDb().prepare("SELECT user_id, number, first_name, last_name, email FROM pbx_extensions WHERE id = ?").get(id) as { user_id: number; number: string; first_name: string; last_name: string; email: string } | undefined;
  const company = ownedCompany(formData, row?.user_id || 0, "/admin/phone");
  const { removeExtension } = await import("@/lib/pbx");
  const result = await removeExtension(id);
  audit(user.email, "pbx.person.remove", row && result.ok ? `${row.number} ${row.first_name} ${row.last_name} ${row.email}` : `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/phone/${company}?tab=extensions&ext=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/phone/${company}?tab=extensions&ext=${id}&saved=removed`);
}

export async function provisionPerson(formData: FormData) {
  const user = await staff("settings.phone");
  const id = Number(formData.get("id"));
  const row = getDb().prepare("SELECT user_id FROM pbx_extensions WHERE id = ?").get(id) as { user_id: number } | undefined;
  const company = ownedCompany(formData, row?.user_id || 0, "/admin/phone");
  const { provisionExtension } = await import("@/lib/pbx");
  const result = await provisionExtension(id);
  audit(user.email, "pbx.provision", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/phone/${company}?tab=extensions&ext=${id}&error=${encodeURIComponent(result.detail || result.message)}`);
  redirect(`/admin/phone/${company}?tab=extensions&ext=${id}`);
}

export async function resendPersonEmail(formData: FormData) {
  const user = await staff("settings.phone");
  const id = Number(formData.get("id"));
  const row = getDb().prepare("SELECT user_id, status, xapi_id FROM pbx_extensions WHERE id = ?").get(id) as { user_id: number; status: string; xapi_id: number } | undefined;
  const company = ownedCompany(formData, row?.user_id || 0, "/admin/phone");
  const { resendSetupEmail } = await import("@/lib/pbx");
  const result = await resendSetupEmail(id);
  audit(user.email, "pbx.setup-email", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/phone/${company}?tab=extensions&ext=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/phone/${company}?tab=extensions&ext=${id}&saved=email`);
}

export async function syncMinutes() {
  const user = await staff("settings.lines");
  const { syncAllMinutes } = await import("@/lib/minutes");
  const result = await syncAllMinutes();
  audit(user.email, "minutes.sync", result.ok ? "ok" : "failed");
  if (!result.ok) redirect(`/admin/lines?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/lines?saved=1");
}

export async function retryTrunk(formData: FormData) {
  const user = await staff("settings.lines");
  const id = Number(formData.get("id"));
  const row = getDb().prepare("SELECT user_id FROM phone_lines WHERE id = ?").get(id) as { user_id: number } | undefined;
  ownedCompany(formData, row?.user_id || 0, "/admin/lines");
  const { attachTrunk } = await import("@/lib/lines");
  const result = await attachTrunk(id);
  audit(user.email, "trunk.retry", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/lines?line=${id}`);
}

export async function revealSip(company: number, which: "user" | "pass") {
  const user = await staff("settings.lines");
  if (!companyMatches(company, company)) return { ok: false as const, message: "That company was not found." };
  const row = getDb().prepare("SELECT account, username, password FROM voip_subaccounts WHERE user_id = ?").get(company) as { account: string; username: string; password: string } | undefined;
  if (!row) return { ok: false as const, message: "No SIP account is saved for this company." };
  audit(user.email, which === "pass" ? "sip.reveal.password" : "sip.reveal.user", String(company));
  return { ok: true as const, value: which === "pass" ? row.password : row.account || row.username };
}

export async function sendEmergencyAddress(formData: FormData) {
  const user = await staff("settings.lines");
  const id = Number(formData.get("id"));
  const row = getDb().prepare("SELECT user_id FROM phone_lines WHERE id = ?").get(id) as { user_id: number } | undefined;
  ownedCompany(formData, row?.user_id || 0, "/admin/lines");
  const { sendEmergency } = await import("@/lib/e911");
  const result = await sendEmergency(id);
  audit(user.email, "e911.send", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/lines?line=${id}`);
}

export async function completeEmergency(formData: FormData) {
  const user = await staff("settings.lines");
  const id = Number(formData.get("id"));
  const owner = getDb().prepare("SELECT user_id FROM phone_lines WHERE id = ?").get(id) as { user_id: number } | undefined;
  ownedCompany(formData, owner?.user_id || 0, "/admin/lines");
  const { markEmergencyDone } = await import("@/lib/e911");
  const result = markEmergencyDone(id, String(formData.get("note") || ""));
  audit(user.email, "e911.done", String(id));
  if (!result.ok) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/lines?line=${id}`);
}

function postedTrunkId(formData: FormData) {
  const raw = String(formData.get("trunk_id") || "").trim();
  if (!raw) return 0;
  return /^\d+$/.test(raw) ? Number(raw) : -1;
}

export async function linkTrunk(formData: FormData) {
  const user = await staff("settings.lines");
  const id = Number(formData.get("id"));
  const owner = getDb().prepare("SELECT user_id FROM phone_lines WHERE id = ?").get(id) as { user_id: number } | undefined;
  ownedCompany(formData, owner?.user_id || 0, "/admin/lines");
  const trunkId = postedTrunkId(formData);
  if (trunkId < 1) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent("Enter the trunk id shown in 3CX.")}`);
  const { linkManualTrunk } = await import("@/lib/lines");
  const result = await linkManualTrunk(id, trunkId);
  audit(user.email, "trunk.link", `${id}:${trunkId}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/lines?line=${id}&saved=linked`);
}

export async function completeTrunk(formData: FormData) {
  const user = await staff("settings.lines");
  const id = Number(formData.get("id"));
  const owner = getDb().prepare("SELECT user_id FROM phone_lines WHERE id = ?").get(id) as { user_id: number } | undefined;
  ownedCompany(formData, owner?.user_id || 0, "/admin/lines");
  const trunkId = postedTrunkId(formData);
  if (trunkId < 0) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent("Enter the trunk id shown in 3CX.")}`);
  const note = String(formData.get("note") || "");
  const { markTrunkDone } = await import("@/lib/lines");
  const result = markTrunkDone(id, note, trunkId);
  audit(user.email, "trunk.done", `${id}:${trunkId || "none"}`);
  if (!result.ok) redirect(`/admin/lines?line=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/lines?line=${id}&saved=recorded`);
}

export async function retryGroup(formData: FormData) {
  const user = await staff("settings.phone");
  const id = Number(formData.get("id"));
  const owner = getDb().prepare("SELECT user_id, kind FROM call_groups WHERE id = ?").get(id) as { user_id: number; kind: string } | undefined;
  const company = ownedCompany(formData, owner?.user_id || 0, "/admin/phone");
  const { provisionCallGroup } = await import("@/lib/call-groups");
  const result = await provisionCallGroup(id);
  audit(user.email, "pbx.group", `${id}:${result.ok ? "ok" : "failed"}`);
  const tab = owner?.kind === "queue" ? "queues" : "groups";
  if (!result.ok) redirect(`/admin/phone/${company}?tab=${tab}&group=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/phone/${company}?tab=${tab}&group=${id}`);
}

export async function completeGroup(formData: FormData) {
  const user = await staff("settings.phone");
  const id = Number(formData.get("id"));
  const owner = getDb().prepare("SELECT user_id, kind FROM call_groups WHERE id = ?").get(id) as { user_id: number; kind: string } | undefined;
  const company = ownedCompany(formData, owner?.user_id || 0, "/admin/phone");
  const { markGroupDone } = await import("@/lib/call-groups");
  const result = await markGroupDone(id, String(formData.get("note") || ""));
  audit(user.email, "pbx.group.done", String(id));
  const tab = owner?.kind === "queue" ? "queues" : "groups";
  if (!result.ok) redirect(`/admin/phone/${company}?tab=${tab}&group=${id}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/phone/${company}?tab=${tab}&group=${id}&saved=recorded`);
}

export async function saveLineVariables(formData: FormData) {
  const user = await staff("settings.connections");
  const { listLineVariables, saveLineVariables: persist } = await import("@/lib/line-variable-store");
  const current = listLineVariables();
  const { variableUpdates } = await import("@/lib/line-variables");
  const fields: Record<string, string | undefined> = {};
  for (const item of current) {
    const value = formData.get(`value_${item.key}`);
    const audience = formData.get(`audience_${item.key}`);
    if (typeof value === "string") fields[`value_${item.key}`] = value;
    if (typeof audience === "string") fields[`audience_${item.key}`] = audience;
  }
  const rows = variableUpdates(current, fields);
  const savedKey = rows[0]?.key || "";
  persist(rows);
  audit(user.email, "line.variables", savedKey || "saved");
  redirect(`/admin/variables?key=${encodeURIComponent(savedKey)}&saved=1`);
}
