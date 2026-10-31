import { getDb } from "./db";
import { accountAiFeature, knownAccountAi, validateAiExtension, validateAiGreeting, type AccountAiCode } from "./ai-account";
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

export function saveAccountAi(userId: number, plan: Plan | null, input: { feature: string; displayName: string; greeting: string; extensionId: number }) {
  if (!knownAccountAi(input.feature)) return { ok: false as const, message: "Choose an AI system." };
  const featureKey = accountAiFeature(input.feature);
  if (!featureKey || !planAllows(plan, featureKey)) return { ok: false as const, message: "That AI system is not included on this plan." };
  const named = validateAiExtension({ role: input.extensionId ? input.feature : "", name: input.displayName, allowed: [input.feature] });
  if (!named.ok) return named;
  const displayName = input.displayName.trim().slice(0, 40);
  if (!displayName) return { ok: false as const, message: "Name this AI system." };
  const greeting = validateAiGreeting(input.greeting).greeting;
  const database = getDb();
  if (input.extensionId) {
    const owned = database.prepare("SELECT id FROM pbx_extensions WHERE id = ? AND user_id = ? AND status != 'removed'").get(input.extensionId, userId) as { id: number } | undefined;
    if (!owned) return { ok: false as const, message: "Choose an extension on this account." };
  }
  const now = new Date().toISOString();
  database.prepare(
    `INSERT INTO ai_account_settings (user_id, feature_code, display_name, greeting, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, feature_code) DO UPDATE SET display_name = excluded.display_name, greeting = excluded.greeting, updated_at = excluded.updated_at`,
  ).run(userId, input.feature, displayName, greeting, now);
  database.prepare("UPDATE pbx_extensions SET ai_role = '', ai_name = '' WHERE user_id = ? AND ai_role = ?").run(userId, input.feature);
  if (input.extensionId) {
    database.prepare("UPDATE pbx_extensions SET ai_role = ?, ai_name = ? WHERE id = ? AND user_id = ?").run(input.feature, displayName, input.extensionId, userId);
  }
  return { ok: true as const, feature: input.feature as AccountAiCode };
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
