import { getDb } from "./db";
import { redactSecret } from "./provider-error";

export const FAILURE_AREAS = ["number", "extension", "group", "payment", "trunk", "transfer", "emergency", "minutes", "client", "connection", "email"] as const;

export type FailureArea = (typeof FAILURE_AREAS)[number];

export function recordFailure(entry: { area: string; userId?: number; subject: string; detail: string }) {
  const detail = redactSecret(entry.detail);
  if (!detail) return 0;
  try {
    const info = getDb()
      .prepare("INSERT INTO failure_log (area, user_id, subject, detail, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(entry.area.slice(0, 40), entry.userId || 0, entry.subject.slice(0, 160), detail, new Date().toISOString());
    return Number(info.lastInsertRowid) || 0;
  } catch (error) {
    console.error("[sauticall] failure log", error instanceof Error ? error.message : error);
    return 0;
  }
}

export function updateFailure(id: number, detail: string) {
  const text = redactSecret(detail).slice(0, 2000);
  if (!id || !text) return;
  try {
    getDb().prepare("UPDATE failure_log SET detail = ? WHERE id = ?").run(text, id);
  } catch (error) {
    console.error("[sauticall] failure log", error instanceof Error ? error.message : error);
  }
}
