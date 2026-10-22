"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { audit, getDb, writeDoc } from "@/lib/db";

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
  const payload = {
    name: String(formData.get("name") || "").trim(),
    provider_key: String(formData.get("provider_key") || "").trim().toLowerCase(),
    public_label: String(formData.get("public_label") || "").trim(),
    enabled: formData.get("enabled") === "on" ? 1 : 0,
    priority: Number(formData.get("priority") || 100),
    mode: String(formData.get("mode") || "test") === "live" ? "live" : "test",
    currencies: String(formData.get("currencies") || "USD").trim(),
    secret_ref: String(formData.get("secret_ref") || ""),
  };
  if (!payload.name || !payload.provider_key || !payload.public_label) return { error: "Name, provider key, and public label are required." };
  if (id) {
    getDb()
      .prepare("UPDATE gateways SET name=?, provider_key=?, public_label=?, enabled=?, priority=?, mode=?, currencies=?, secret_ref=? WHERE id=?")
      .run(payload.name, payload.provider_key, payload.public_label, payload.enabled, payload.priority, payload.mode, payload.currencies, payload.secret_ref, id);
    audit(user.email, "gateway.update", String(id));
  } else {
    const info = getDb()
      .prepare("INSERT INTO gateways (name, provider_key, public_label, enabled, priority, mode, currencies, config_json, secret_ref) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)")
      .run(payload.name, payload.provider_key, payload.public_label, payload.enabled, payload.priority, payload.mode, payload.currencies, payload.secret_ref);
    audit(user.email, "gateway.create", String(info.lastInsertRowid));
  }
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
    }, secret);
  } else {
    persist(provider, enabled, {
      base_url: String(formData.get("base_url") || "").trim(),
      client_id: String(formData.get("client_id") || "").trim(),
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
  const row = database().prepare("SELECT payload, kind FROM account_requests WHERE id = ?").get(id) as { payload: string; kind: string } | undefined;
  if (!row || row.kind !== "number") redirect("/admin/requests?error=That%20request%20is%20not%20a%20number.");
  const payload = JSON.parse(row.payload) as { did?: string };
  if (!payload.did) redirect("/admin/requests?error=This%20request%20has%20no%20specific%20number%20to%20order.");
  const { orderDid } = await import("@/lib/carriers");
  const result = await orderDid(payload.did);
  const status = result.ok ? "ordered" : "exception";
  database().prepare("UPDATE account_requests SET status = ?, staff_note = ? WHERE id = ?").run(status, result.ok ? "Ordered with VoIP.ms." : result.message, id);
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
