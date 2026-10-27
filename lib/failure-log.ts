import { getDb } from "./db";
import { redactSecret } from "./provider-error";

export const FAILURE_AREAS = ["number", "extension", "group", "payment", "trunk", "transfer", "emergency", "minutes", "client", "connection", "email"] as const;

export type FailureArea = (typeof FAILURE_AREAS)[number];

export function recordFailure(entry: { area: string; userId?: number; subject: string; detail: string }) {
  const detail = redactSecret(entry.detail);
  if (!detail) return;
  try {
    getDb()
      .prepare("INSERT INTO failure_log (area, user_id, subject, detail, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(entry.area.slice(0, 40), entry.userId || 0, entry.subject.slice(0, 160), detail, new Date().toISOString());
  } catch (error) {
    console.error("[sauticall] failure log", error instanceof Error ? error.message : error);
  }
}
