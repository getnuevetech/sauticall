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
