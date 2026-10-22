"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { audit, getDb, writeDoc } from "@/lib/db";
import { readGatewaySecret, stripePublishableMatches, stripeSecretMatches, writeGatewaySecret } from "@/lib/payment-keys";

async function staff() {
  const user = await requireStaff();
  if (!user) redirect("/account/login");
  return user;
}

export async function saveDocument(key: string, json: string) {
  const user = await staff();
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

export async function saveGateway(formData: FormData) {
  const user = await staff();
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
  if (id) {
    getDb()
      .prepare("UPDATE gateways SET name=?, provider_key=?, public_label=?, enabled=?, priority=?, mode=?, currencies=?, config_json=?, secret=? WHERE id=?")
      .run(payload.name, payload.provider_key, payload.public_label, payload.enabled, payload.priority, payload.mode, payload.currencies, JSON.stringify(config), secret, id);
    audit(user.email, "gateway.update", String(id));
  } else {
    const info = getDb()
      .prepare("INSERT INTO gateways (name, provider_key, public_label, enabled, priority, mode, currencies, config_json, secret_ref, secret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)")
      .run(payload.name, payload.provider_key, payload.public_label, payload.enabled, payload.priority, payload.mode, payload.currencies, JSON.stringify(config), secret);
    audit(user.email, "gateway.create", String(info.lastInsertRowid));
  }
  redirect("/admin/gateways");
}

export async function testGateway(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const { testGateway: check } = await import("@/lib/payments");
  const result = await check(id);
  audit(user.email, "gateway.test", `${id}:${result.ok ? "ok" : "failed"}`);
  redirect("/admin/gateways");
}

export async function setGatewayEnabled(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const enabled = Number(formData.get("enabled"));
  getDb().prepare("UPDATE gateways SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  audit(user.email, enabled ? "gateway.enable" : "gateway.disable", String(id));
  redirect("/admin/gateways");
}

export async function saveConnection(formData: FormData) {
  const user = await staff();
  const provider = String(formData.get("provider") || "");
  if (provider !== "voipms" && provider !== "3cx") redirect("/admin/connections");
  const { saveConnection: persist } = await import("@/lib/carriers");
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
      allowed_codecs: String(formData.get("allowed_codecs") || "ulaw;alaw;g729").trim() || "ulaw;alaw;g729",
      dtmf_mode: String(formData.get("dtmf_mode") || "auto").trim() || "auto",
      nat: String(formData.get("nat") || "yes").trim() || "yes",
    }, secret);
  } else {
    persist(provider, enabled, {
      base_url: String(formData.get("base_url") || "").trim(),
      client_id: String(formData.get("client_id") || "").trim(),
      trunk_template: String(formData.get("trunk_template") || "GenericSIPTrunk.pv.xml").trim() || "GenericSIPTrunk.pv.xml",
    }, secret);
  }
  audit(user.email, "connection.save", provider);
  redirect("/admin/connections");
}

export async function testConnection(formData: FormData) {
  const user = await staff();
  const provider = String(formData.get("provider") || "");
  const { test3cx, testVoipms } = await import("@/lib/carriers");
  const result = provider === "3cx" ? await test3cx() : await testVoipms();
  audit(user.email, "connection.test", `${provider}:${result.ok ? "ok" : "failed"}`);
  redirect("/admin/connections");
}

export async function orderSavedNumber(formData: FormData) {
  const user = await staff();
  const { flagOn, getDb: database } = await import("@/lib/db");
  if (!flagOn("numbers.live_order")) redirect("/admin/requests?error=Live%20number%20ordering%20is%20turned%20off.");
  const id = Number(formData.get("id"));
  const row = database().prepare("SELECT user_id, payload, kind FROM account_requests WHERE id = ?").get(id) as { user_id: number; payload: string; kind: string } | undefined;
  if (!row || row.kind !== "number") redirect("/admin/requests?error=That%20request%20is%20not%20a%20number.");
  const payload = JSON.parse(row.payload) as { did?: string };
  if (!payload.did) redirect("/admin/requests?error=This%20request%20has%20no%20specific%20number%20to%20order.");
  const { purchaseNumber } = await import("@/lib/lines");
  const result = await purchaseNumber({ requestId: id, userId: row.user_id, did: payload.did });
  const status = result.ok ? "ordered" : "exception";
  database().prepare("UPDATE account_requests SET status = ?, staff_note = ? WHERE id = ?").run(status, result.message, id);
  audit(user.email, "request.order", `${id}:${status}`);
  redirect("/admin/requests");
}

export async function refreshPortStatus(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const { getDb: database } = await import("@/lib/db");
  const row = database().prepare("SELECT provider_ref, kind FROM account_requests WHERE id = ?").get(id) as { provider_ref: string; kind: string } | undefined;
  if (!row || row.kind !== "port" || !row.provider_ref) redirect("/admin/requests?error=This%20transfer%20has%20no%20carrier%20reference%20yet.");
  const { portStatus } = await import("@/lib/carriers");
  const result = await portStatus(row.provider_ref);
  database().prepare("UPDATE account_requests SET staff_note = ? WHERE id = ?").run(result.ok ? `Carrier status: ${result.status}` : result.message, id);
  audit(user.email, "request.port.refresh", String(id));
  redirect("/admin/requests");
}

export async function setRequestStatus(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") || "requested");
  const note = String(formData.get("staff_note") || "").slice(0, 400);
  const allowed = new Set(["requested", "submitted", "ordered", "completed", "exception", "cancelled"]);
  if (!allowed.has(status)) redirect("/admin/requests?error=Unknown%20status.");
  getDb().prepare("UPDATE account_requests SET status = ?, staff_note = ? WHERE id = ?").run(status, note, id);
  audit(user.email, "request.status", `${id}:${status}`);
  redirect("/admin/requests");
}

export async function provisionPerson(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const { provisionExtension } = await import("@/lib/pbx");
  const result = await provisionExtension(id);
  audit(user.email, "pbx.provision", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/phone?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/phone");
}

export async function syncMinutes() {
  const user = await staff();
  const { syncAllMinutes } = await import("@/lib/minutes");
  const result = await syncAllMinutes();
  audit(user.email, "minutes.sync", result.ok ? "ok" : "failed");
  if (!result.ok) redirect(`/admin/lines?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/lines?saved=1");
}

export async function retryTrunk(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const { attachTrunk } = await import("@/lib/lines");
  const result = await attachTrunk(id);
  audit(user.email, "trunk.retry", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/lines?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/lines");
}

export async function sendEmergencyAddress(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const { sendEmergency } = await import("@/lib/e911");
  const result = await sendEmergency(id);
  audit(user.email, "e911.send", `${id}:${result.ok ? "ok" : "failed"}`);
  if (!result.ok) redirect(`/admin/lines?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/lines");
}

export async function completeEmergency(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const { markEmergencyDone } = await import("@/lib/e911");
  const result = markEmergencyDone(id, String(formData.get("note") || ""));
  audit(user.email, "e911.done", String(id));
  if (!result.ok) redirect(`/admin/lines?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/lines");
}

export async function completeTrunk(formData: FormData) {
  const user = await staff();
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") || "");
  const { markTrunkDone } = await import("@/lib/lines");
  const result = markTrunkDone(id, note);
  audit(user.email, "trunk.done", String(id));
  if (!result.ok) redirect(`/admin/lines?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/lines");
}
