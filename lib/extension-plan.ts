import { getDb } from "./db";
import { defaultExtensionPlan, normalizeExtensionPlan, type ExtensionPlan } from "./extension-numbers";

export function readExtensionPlan(): ExtensionPlan {
  const row = getDb().prepare("SELECT json FROM documents WHERE key = ?").get("extension_plan") as { json: string } | undefined;
  if (!row) return defaultExtensionPlan;
  try {
    return normalizeExtensionPlan(JSON.parse(row.json));
  } catch {
    return defaultExtensionPlan;
  }
}
