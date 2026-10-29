import { AI_SWITCHES, validateAssignment, validateEngine, type AiEngineDraft, type AiEngineRecord } from "./ai-system";
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

export function deleteAiEngine(id: number, actor: string) {
  const used = getDb().prepare("SELECT function_code FROM ai_assignments WHERE engine_id = ?").get(id) as { function_code: string } | undefined;
  if (used) return { ok: false as const, message: "This engine is assigned to a job. Clear that assignment before removing it." };
  getDb().prepare("DELETE FROM ai_engines WHERE id = ?").run(id);
  audit(actor, "ai.engine.delete", String(id));
  return { ok: true as const };
}
