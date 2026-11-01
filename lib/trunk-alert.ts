import { getDb } from "./db";

export function trunkAlertsWaiting() {
  try {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM phone_lines WHERE status NOT IN ('trunk_live', 'trunk_done', 'not_on_carrier')").get() as { n: number } | undefined;
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}
