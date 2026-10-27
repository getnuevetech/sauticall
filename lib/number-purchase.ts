import { lookupOwnedDid } from "./carriers";
import { getDb } from "./db";
import { normalizeRequestedDid } from "./did-list";
import { carrierDidRef } from "./number-order";

type RequestRow = { id: number; user_id: number; payload: string; status: string; provider_ref: string; staff_note: string };

function requestDid(payload: string) {
  try {
    return String((JSON.parse(payload) as { did?: string }).did || "");
  } catch {
    return "";
  }
}

let reconciling = false;

export async function reconcileBoughtNumbers(userId?: number) {
  if (reconciling) return;
  reconciling = true;
  try {
    await reconcileOnce(userId);
  } finally {
    reconciling = false;
  }
}

async function reconcileOnce(userId?: number) {
  let rows: RequestRow[] = [];
  try {
    const database = getDb();
    rows = (userId
      ? database.prepare("SELECT id, user_id, payload, status, provider_ref, staff_note FROM account_requests WHERE kind = 'number' AND user_id = ? AND status IN ('ordered', 'completed', 'exception')").all(userId)
      : database.prepare("SELECT id, user_id, payload, status, provider_ref, staff_note FROM account_requests WHERE kind = 'number' AND status IN ('ordered', 'completed', 'exception')").all()) as RequestRow[];
  } catch (error) {
    console.error("[sauticall] number reconcile", error instanceof Error ? error.message : error);
    return;
  }
  for (const row of rows) {
    try {
      const database = getDb();
      const did = requestDid(row.payload);
      const ref = carrierDidRef(did);
      const marked = ref && row.provider_ref === ref && (row.status === "ordered" || row.status === "completed");
      if (marked) continue;
      const owned = await lookupOwnedDid(did);
      if (!owned.ok) {
        if (row.status === "exception") continue;
        const note = `VoIP.ms could not be checked (${owned.message}). This number is not marked bought.`;
        if (row.staff_note !== note) database.prepare("UPDATE account_requests SET staff_note = ? WHERE id = ?").run(note, row.id);
        continue;
      }
      if (owned.owned && ref) {
        const status = row.status === "completed" ? "completed" : "ordered";
        database.prepare("UPDATE account_requests SET status = ?, provider_ref = ?, staff_note = ? WHERE id = ?").run(status, ref, "VoIP.ms has this number.", row.id);
        continue;
      }
      if (row.status === "exception") continue;
      const label = did || "this number";
      const kept = /orderDID|getDIDsInfo|connectDID/.test(row.staff_note);
      const note = kept ? row.staff_note : `VoIP.ms does not have ${label}, so it is not bought.`;
      database.prepare("UPDATE account_requests SET status = 'exception', provider_ref = '', staff_note = ? WHERE id = ?").run(note, row.id);
      const wanted = normalizeRequestedDid(did);
      if (!wanted) continue;
      const lines = database.prepare("SELECT id, did FROM phone_lines WHERE user_id = ? AND trunk_id = 0").all(row.user_id) as { id: number; did: string }[];
      for (const line of lines) {
        if (normalizeRequestedDid(line.did) !== wanted && line.did !== did) continue;
        database.prepare("UPDATE phone_lines SET status = 'not_on_carrier', last_message = ? WHERE id = ?").run(`VoIP.ms does not have ${wanted}.`, line.id);
      }
    } catch (error) {
      console.error("[sauticall] number reconcile", error instanceof Error ? error.message : error);
    }
  }
}
