import { getDb } from "./db";
import { accountAiFeature, knownAccountAi, validateAiExtension, type AccountAiCode } from "./ai-account";
import { validateAccountInstructions, workspaceProfile } from "./ai-workspace";
import { planAllows } from "./plan-features";
import type { Plan } from "./types";

export type AiExtensionRow = {
  id: number;
  number: string;
  first_name: string;
  last_name: string;
  status: string;
  xapi_id: number;
  ai_role: string;
  ai_name: string;
};

export function listAiExtensions(userId: number) {
  return getDb().prepare(
    "SELECT id, number, first_name, last_name, status, xapi_id, ai_role, ai_name FROM pbx_extensions WHERE user_id = ? AND status != 'removed' ORDER BY number",
  ).all(userId) as AiExtensionRow[];
}

export function aiSettingsFor(userId: number, feature: string) {
  return getDb().prepare("SELECT display_name, greeting FROM ai_account_settings WHERE user_id = ? AND feature_code = ?").get(userId, feature) as { display_name: string; greeting: string } | undefined;
}

export function saveAccountAi(userId: number, plan: Plan | null, input: { feature: string; displayName: string; extensionId: number }) {
  if (!knownAccountAi(input.feature)) return { ok: false as const, message: "Choose an AI system." };
  const featureKey = accountAiFeature(input.feature);
  if (!featureKey || !planAllows(plan, featureKey)) return { ok: false as const, message: "That AI system is not included on this plan." };
  const displayName = input.displayName.trim().slice(0, 40);
  if (!displayName) return { ok: false as const, message: "Name this AI system." };
  const database = getDb();
  const assignExtension = workspaceProfile(input.feature).usesExtension;
  const extensionId = assignExtension ? input.extensionId : 0;
  if (extensionId) {
    const named = validateAiExtension({ role: input.feature, name: displayName, allowed: [input.feature] });
    if (!named.ok) return named;
    const owned = database.prepare("SELECT id FROM pbx_extensions WHERE id = ? AND user_id = ? AND status != 'removed'").get(extensionId, userId) as { id: number } | undefined;
    if (!owned) return { ok: false as const, message: "Choose an extension on this account." };
  }
  const now = new Date().toISOString();
  const existing = aiSettingsFor(userId, input.feature);
  database.prepare(
    `INSERT INTO ai_account_settings (user_id, feature_code, display_name, greeting, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, feature_code) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
  ).run(userId, input.feature, displayName, existing?.greeting || "", now);
  if (assignExtension) {
    database.prepare("UPDATE pbx_extensions SET ai_role = '', ai_name = '' WHERE user_id = ? AND ai_role = ?").run(userId, input.feature);
    if (extensionId) database.prepare("UPDATE pbx_extensions SET ai_role = ?, ai_name = ? WHERE id = ? AND user_id = ?").run(input.feature, displayName, extensionId, userId);
  }
  return { ok: true as const, feature: input.feature as AccountAiCode };
}

export function listPromptVersions(userId: number, feature: string) {
  if (!knownAccountAi(feature)) return [];
  return getDb().prepare(
    "SELECT id, body, created_at FROM ai_prompt_versions WHERE user_id = ? AND feature_code = ? ORDER BY id DESC LIMIT 8",
  ).all(userId, feature) as { id: number; body: string; created_at: string }[];
}

export function saveAccountPrompt(userId: number, plan: Plan | null, input: { feature: string; body: string }) {
  if (!knownAccountAi(input.feature)) return { ok: false as const, message: "Choose an AI system." };
  const featureKey = accountAiFeature(input.feature);
  if (!featureKey || !planAllows(plan, featureKey)) return { ok: false as const, message: "That AI system is not included on this plan." };
  const parsed = validateAccountInstructions(input.body);
  if (!parsed.ok) return parsed;
  const database = getDb();
  const existing = aiSettingsFor(userId, input.feature);
  const now = new Date().toISOString();
  if (existing && existing.greeting !== parsed.body && existing.greeting.trim()) {
    database.prepare("INSERT INTO ai_prompt_versions (user_id, feature_code, body, created_at) VALUES (?, ?, ?, ?)").run(userId, input.feature, existing.greeting, now);
  }
  database.prepare(
    `INSERT INTO ai_account_settings (user_id, feature_code, display_name, greeting, updated_at)
     VALUES (?, ?, '', ?, ?)
     ON CONFLICT(user_id, feature_code) DO UPDATE SET greeting = excluded.greeting, updated_at = excluded.updated_at`,
  ).run(userId, input.feature, parsed.body, now);
  return { ok: true as const, feature: input.feature as AccountAiCode };
}

export function restoreAccountPrompt(userId: number, plan: Plan | null, feature: string) {
  if (!knownAccountAi(feature)) return { ok: false as const, message: "Choose an AI system." };
  return saveAccountPrompt(userId, plan, { feature, body: workspaceProfile(feature).template });
}

export function assignExtensionAi(userId: number, plan: Plan | null, extensionId: number, role: string, name: string) {
  const included = role ? [role] : [];
  const allowed = included.filter((code) => {
    const feature = accountAiFeature(code);
    return feature && planAllows(plan, feature);
  });
  const result = validateAiExtension({ role, name, allowed });
  if (!result.ok) return result;
  const database = getDb();
  const owned = database.prepare("SELECT id FROM pbx_extensions WHERE id = ? AND user_id = ? AND status != 'removed'").get(extensionId, userId) as { id: number } | undefined;
  if (!owned) return { ok: false as const, message: "That extension was not found." };
  if (result.role) database.prepare("UPDATE pbx_extensions SET ai_role = '', ai_name = '' WHERE user_id = ? AND ai_role = ? AND id != ?").run(userId, result.role, extensionId);
  database.prepare("UPDATE pbx_extensions SET ai_role = ?, ai_name = ? WHERE id = ? AND user_id = ?").run(result.role, result.name, extensionId, userId);
  if (result.role) {
    database.prepare(
      `INSERT INTO ai_account_settings (user_id, feature_code, display_name, greeting, updated_at)
       VALUES (?, ?, ?, '', ?)
       ON CONFLICT(user_id, feature_code) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
    ).run(userId, result.role, result.name, new Date().toISOString());
  }
  return { ok: true as const, role: result.role, name: result.name };
}
