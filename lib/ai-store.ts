import { AI_SWITCHES, DRAFT_NOTIFICATION_AGREEMENT, acceptanceComplete, nextAgreementVersion, validateAssignment, validateEngine, type AiEngineDraft, type AiEngineRecord, type AiGrant } from "./ai-system";
import { audit, getDb } from "./db";

export function listAiSwitches() {
  const rows = getDb().prepare("SELECT code, enabled FROM ai_switches").all() as { code: string; enabled: number }[];
  const enabled = new Set(rows.filter((row) => row.enabled).map((row) => row.code));
  return AI_SWITCHES.map((item) => ({ ...item, enabled: enabled.has(item.code) }));
}

export function enabledSwitchCodes() {
  return new Set(listAiSwitches().filter((item) => item.enabled).map((item) => item.code));
}

export function listAiEngines(): AiEngineRecord[] {
  return (getDb().prepare("SELECT id, name, kind, model_name, endpoint, secret_ref, enabled FROM ai_engines ORDER BY name, id").all() as {
    id: number;
    name: string;
    kind: string;
    model_name: string;
    endpoint: string;
    secret_ref: string;
    enabled: number;
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    model: row.model_name,
    endpoint: row.endpoint,
    secretRef: row.secret_ref,
    enabled: row.enabled === 1,
  }));
}

export function listAiAssignments() {
  return getDb().prepare("SELECT function_code, engine_id FROM ai_assignments").all() as { function_code: string; engine_id: number }[];
}

export function saveAiSwitches(codes: string[], actor: string) {
  const allowed = new Set<string>(AI_SWITCHES.map((item) => item.code));
  const chosen = new Set(codes.filter((code) => allowed.has(code)));
  const database = getDb();
  const update = database.prepare("UPDATE ai_switches SET enabled = ?, updated_at = ? WHERE code = ?");
  const now = new Date().toISOString();
  const apply = database.transaction(() => {
    for (const item of AI_SWITCHES) update.run(chosen.has(item.code) ? 1 : 0, now, item.code);
  });
  apply();
  audit(actor, "ai.switches", [...chosen].sort().join(",") || "all-off");
}

export function saveAiEngine(id: number | null, draft: AiEngineDraft, actor: string) {
  const parsed = validateEngine(draft);
  if (!parsed.ok) return parsed;
  const engine = parsed.engine;
  const now = new Date().toISOString();
  const database = getDb();
  if (id) {
    const existing = database.prepare("SELECT id FROM ai_engines WHERE id = ?").get(id) as { id: number } | undefined;
    if (!existing) return { ok: false as const, message: "That engine was not found." };
    database.prepare("UPDATE ai_engines SET name = ?, kind = ?, model_name = ?, endpoint = ?, secret_ref = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(engine.name, engine.kind, engine.model, engine.endpoint, engine.secretRef, engine.enabled ? 1 : 0, now, id);
    audit(actor, "ai.engine", String(id));
    return { ok: true as const, id };
  }
  const result = database.prepare("INSERT INTO ai_engines (name, kind, model_name, endpoint, secret_ref, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(engine.name, engine.kind, engine.model, engine.endpoint, engine.secretRef, engine.enabled ? 1 : 0, now);
  const created = Number(result.lastInsertRowid);
  audit(actor, "ai.engine", String(created));
  return { ok: true as const, id: created };
}

export function saveAiAssignment(functionCode: string, engineId: number, actor: string) {
  const parsed = validateAssignment(functionCode, engineId, listAiEngines());
  if (!parsed.ok) return parsed;
  getDb().prepare(
    `INSERT INTO ai_assignments (function_code, engine_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(function_code) DO UPDATE SET engine_id = excluded.engine_id, updated_at = excluded.updated_at`,
  ).run(parsed.functionCode, parsed.engineId, new Date().toISOString());
  audit(actor, "ai.assignment", `${parsed.functionCode}:${parsed.engineId}`);
  return { ok: true as const };
}

export function clearAiAssignment(functionCode: string, actor: string) {
  getDb().prepare("DELETE FROM ai_assignments WHERE function_code = ?").run(functionCode);
  audit(actor, "ai.assignment", `${functionCode}:cleared`);
}

export function currentAgreement(featureCode: string) {
  return getDb().prepare("SELECT feature_code, version, title, body, digest FROM ai_agreements WHERE feature_code = ? ORDER BY version DESC LIMIT 1").get(featureCode) as {
    feature_code: string;
    version: number;
    title: string;
    body: string;
    digest: string;
  } | undefined;
}

export function publishAgreement(featureCode: string, title: string, body: string, actor: string) {
  const cleanTitle = title.trim().slice(0, 120);
  const cleanBody = body.trim().slice(0, 8000);
  if (!cleanTitle || !cleanBody) return { ok: false as const, message: "Enter a title and the agreement text." };
  const current = currentAgreement(featureCode);
  const next = nextAgreementVersion(current ? { version: current.version, digest: current.digest } : null, cleanTitle, cleanBody);
  if (!next.changed) return { ok: true as const, version: next.version };
  getDb().prepare("INSERT INTO ai_agreements (feature_code, version, title, body, digest, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(featureCode, next.version, cleanTitle, cleanBody, next.digest, new Date().toISOString());
  audit(actor, "ai.agreement", `${featureCode}:${next.version}`);
  return { ok: true as const, version: next.version };
}

export function acceptedVersion(userId: number, featureCode: string) {
  const row = getDb().prepare("SELECT version FROM ai_acceptances WHERE user_id = ? AND feature_code = ? ORDER BY version DESC, id DESC LIMIT 1").get(userId, featureCode) as { version: number } | undefined;
  return row?.version || 0;
}

export function entitlementFor(userId: number, featureCode: string) {
  const row = getDb().prepare("SELECT admin_grant, customer_enabled FROM ai_entitlements WHERE user_id = ? AND feature_code = ?").get(userId, featureCode) as { admin_grant: string; customer_enabled: number } | undefined;
  const grant: AiGrant = row?.admin_grant === "requested" || row?.admin_grant === "granted" || row?.admin_grant === "suspended" ? row.admin_grant : "none";
  const customerEnabled = row ? row.customer_enabled === 1 : featureCode !== "notifications";
  return { grant, customerEnabled };
}

export function acceptAgreement(userId: number, featureCode: string, codes: string[], ipHash: string) {
  const agreement = currentAgreement(featureCode);
  if (!agreement) return { ok: false as const, message: "An administrator has not published terms for this service." };
  if (featureCode === "notifications" && !acceptanceComplete(codes)) return { ok: false as const, message: "Check each acknowledgment. None are selected for you." };
  if (featureCode !== "notifications" && !codes.includes("accept")) return { ok: false as const, message: "Check the acknowledgment before continuing." };
  const before = acceptedVersion(userId, featureCode);
  const current = entitlementFor(userId, featureCode);
  getDb().prepare("INSERT INTO ai_acceptances (user_id, feature_code, version, acks, digest, accepted_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(userId, featureCode, agreement.version, JSON.stringify(codes), agreement.digest, new Date().toISOString(), ipHash);
  const grant = featureCode === "notifications" && before > 0 && before < agreement.version && current.grant === "granted" ? "requested" : current.grant;
  saveEntitlement(userId, featureCode, grant, current.customerEnabled, "terms accepted");
  audit(`user:${userId}`, "ai.accept", `${featureCode}:${agreement.version}`);
  return { ok: true as const };
}

function saveEntitlement(userId: number, featureCode: string, grant: AiGrant, customerEnabled: boolean, reason: string) {
  getDb().prepare(
    `INSERT INTO ai_entitlements (user_id, feature_code, admin_grant, customer_enabled, reason, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, feature_code) DO UPDATE SET admin_grant = excluded.admin_grant, customer_enabled = excluded.customer_enabled, reason = excluded.reason, updated_at = excluded.updated_at`,
  ).run(userId, featureCode, grant, customerEnabled ? 1 : 0, reason.slice(0, 200), new Date().toISOString());
}

export function requestActivation(userId: number, featureCode: string) {
  const current = entitlementFor(userId, featureCode);
  if (current.grant === "suspended") return { ok: false as const, message: "SautiCall has suspended this service." };
  saveEntitlement(userId, featureCode, "requested", false, "customer requested");
  audit(`user:${userId}`, "ai.request", featureCode);
  return { ok: true as const };
}

export function setCustomerEnabled(userId: number, featureCode: string, enabled: boolean) {
  const current = entitlementFor(userId, featureCode);
  if (current.grant === "suspended") return { ok: false as const, message: "SautiCall has suspended this service." };
  if (featureCode === "notifications" && current.grant !== "granted") return { ok: false as const, message: "This service is waiting for review." };
  saveEntitlement(userId, featureCode, current.grant, enabled, enabled ? "customer on" : "customer off");
  audit(`user:${userId}`, "ai.customer", `${featureCode}:${enabled ? "on" : "off"}`);
  return { ok: true as const };
}

export function setAdminGrant(userId: number, featureCode: string, grant: AiGrant, actor: string, reason: string) {
  const current = entitlementFor(userId, featureCode);
  saveEntitlement(userId, featureCode, grant, grant === "granted" ? current.customerEnabled : false, reason || grant);
  audit(actor, "ai.grant", `${userId}:${featureCode}:${grant}`);
}

export function deleteAiEngine(id: number, actor: string) {
  const used = getDb().prepare("SELECT function_code FROM ai_assignments WHERE engine_id = ?").get(id) as { function_code: string } | undefined;
  if (used) return { ok: false as const, message: "This engine is assigned to a job. Clear that assignment before removing it." };
  getDb().prepare("DELETE FROM ai_engines WHERE id = ?").run(id);
  audit(actor, "ai.engine.delete", String(id));
  return { ok: true as const };
}
