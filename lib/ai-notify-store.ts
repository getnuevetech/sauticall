import { applyListen, choiceLine, dialBlockers, hoursOpen, normalizeNotifyPolicy, practiceAllowed, purposeCode, startListen, type ListenEvent, type ListenState, type NotifyPolicy } from "./ai-notify";
import { activationState, featureReady } from "./ai-system";
import { acceptedVersion, currentAgreement, enabledSwitchCodes, entitlementFor } from "./ai-store";
import { audit, getDb } from "./db";
import { paidPlan } from "./pbx";
import { planAllows } from "./plan-features";
import { normalizeMobile } from "./verify-code";

export type PurposeRow = { code: string; label: string; promotional: boolean; enabled: boolean };
export type CampaignRow = { id: number; userId: number; name: string; purposeCode: string; businessName: string; callerId: string; clipId: number };
export type RecipientRow = {
  id: number;
  campaignId: number;
  userId: number;
  personName: string;
  e164: string;
  consent: string;
  outcome: ListenState["outcome"];
  phase: ListenState["phase"];
  repeatsLeft: number;
  contentPlayed: boolean;
};

function policyFrom(row: { repeats: number; promo_enabled: number; window_start: string; window_end: string; time_zone: string }): NotifyPolicy {
  return { repeats: row.repeats, promoEnabled: row.promo_enabled === 1, windowStart: row.window_start, windowEnd: row.window_end, timeZone: row.time_zone };
}

export function notifyPolicy() {
  const row = getDb().prepare("SELECT repeats, promo_enabled, window_start, window_end, time_zone FROM ai_notify_policy WHERE id = 1").get() as {
    repeats: number; promo_enabled: number; window_start: string; window_end: string; time_zone: string;
  };
  return policyFrom(row);
}

export function saveNotifyPolicy(input: NotifyPolicy, actor: string) {
  const result = normalizeNotifyPolicy(input);
  if (!result.ok) return result;
  getDb().prepare("UPDATE ai_notify_policy SET repeats = ?, promo_enabled = ?, window_start = ?, window_end = ?, time_zone = ? WHERE id = 1")
    .run(result.policy.repeats, result.policy.promoEnabled ? 1 : 0, result.policy.windowStart, result.policy.windowEnd, result.policy.timeZone);
  audit(actor, "ai.notify.policy", `${result.policy.repeats}`);
  return { ok: true as const };
}

export function listPurposes() {
  return (getDb().prepare("SELECT code, label, promotional, enabled FROM ai_notify_purposes ORDER BY label").all() as {
    code: string; label: string; promotional: number; enabled: number;
  }[]).map((row) => ({ code: row.code, label: row.label, promotional: row.promotional === 1, enabled: row.enabled === 1 }));
}

export function savePurpose(label: string, promotional: boolean, enabled: boolean, actor: string) {
  const code = purposeCode(label);
  const clean = label.trim().slice(0, 80);
  if (!code || !clean) return { ok: false as const, message: "Enter a purpose." };
  if (enabled && promotional && !notifyPolicy().promoEnabled) return { ok: false as const, message: "Turn on promotional notifications before enabling this purpose." };
  getDb().prepare(
    `INSERT INTO ai_notify_purposes (code, label, promotional, enabled) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET label = excluded.label, promotional = excluded.promotional, enabled = excluded.enabled`,
  ).run(code, clean, promotional ? 1 : 0, enabled ? 1 : 0);
  audit(actor, "ai.notify.purpose", code);
  return { ok: true as const, code };
}

export function deletePurpose(code: string, actor: string) {
  const used = getDb().prepare("SELECT id FROM ai_campaigns WHERE purpose_code = ? LIMIT 1").get(code);
  if (used) return { ok: false as const, message: "A notification still uses this purpose." };
  getDb().prepare("DELETE FROM ai_notify_purposes WHERE code = ?").run(code);
  audit(actor, "ai.notify.purpose.delete", code);
  return { ok: true as const };
}

export function listSuppressions(userId?: number) {
  const sql = userId
    ? "SELECT user_id, e164, created_at FROM ai_suppressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 40"
    : "SELECT user_id, e164, created_at FROM ai_suppressions ORDER BY created_at DESC LIMIT 40";
  return getDb().prepare(sql).all(...(userId ? [userId] : [])) as { user_id: number; e164: string; created_at: string }[];
}

function serviceOn(userId: number) {
  const plan = paidPlan(userId);
  const agreement = currentAgreement("notifications");
  const ent = entitlementFor(userId, "notifications");
  return activationState({
    globalOn: featureReady(enabledSwitchCodes(), "notifications"),
    planIncludes: planAllows(plan, "ai_notifications"),
    publishedVersion: agreement?.version || 0,
    acceptedVersion: acceptedVersion(userId, "notifications"),
    grant: ent.grant,
    customerEnabled: ent.customerEnabled,
    reviewRequired: true,
  }).code === "active";
}

export function notificationsActive(userId: number) {
  return serviceOn(userId);
}

function mapCampaign(row: { id: number; user_id: number; name: string; purpose_code: string; business_name: string; caller_id: string; clip_id: number }): CampaignRow {
  return { id: row.id, userId: row.user_id, name: row.name, purposeCode: row.purpose_code, businessName: row.business_name, callerId: row.caller_id, clipId: row.clip_id };
}

export function listCampaigns(userId: number) {
  return (getDb().prepare("SELECT id, user_id, name, purpose_code, business_name, caller_id, clip_id FROM ai_campaigns WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(userId) as Parameters<typeof mapCampaign>[0][]).map(mapCampaign);
}

export function saveCampaign(userId: number, input: { name: string; purposeCode: string; businessName: string; callerId: string; clipId: number }, actor: string) {
  if (!serviceOn(userId)) return { ok: false as const, message: "Turn on Automated notifications before preparing one." };
  const name = input.name.trim().slice(0, 80);
  const businessName = input.businessName.trim().slice(0, 80);
  const callerId = normalizeMobile(input.callerId);
  if (!name) return { ok: false as const, message: "Enter a name for this notification." };
  if (!choiceLine(businessName)) return { ok: false as const, message: "Enter the business name people will hear." };
  if (!callerId) return { ok: false as const, message: "Enter the caller ID as a phone number." };
  const purpose = listPurposes().find((item) => item.code === input.purposeCode && item.enabled);
  if (!purpose) return { ok: false as const, message: "Choose a purpose an administrator has turned on." };
  if (purpose.promotional && !notifyPolicy().promoEnabled) return { ok: false as const, message: "Promotional notifications are turned off." };
  const clip = getDb().prepare("SELECT id FROM ai_clips WHERE id = ? AND user_id = ? AND status = 'ready'").get(input.clipId, userId);
  if (!clip) return { ok: false as const, message: "Keep an audio version before using it." };
  const created = getDb().prepare("INSERT INTO ai_campaigns (user_id, name, purpose_code, business_name, caller_id, clip_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(userId, name, purpose.code, businessName, callerId, input.clipId, new Date().toISOString());
  audit(actor, "ai.notify.campaign", String(created.lastInsertRowid));
  return { ok: true as const, id: Number(created.lastInsertRowid) };
}

function mapRecipient(row: {
  id: number; campaign_id: number; user_id: number; person_name: string; e164: string; consent: string; outcome: ListenState["outcome"]; phase: ListenState["phase"]; repeats_left: number; content_played: number;
}): RecipientRow {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    personName: row.person_name,
    e164: row.e164,
    consent: row.consent,
    outcome: row.outcome,
    phase: row.phase,
    repeatsLeft: row.repeats_left,
    contentPlayed: row.content_played === 1,
  };
}

export function listRecipients(userId: number) {
  return (getDb().prepare("SELECT id, campaign_id, user_id, person_name, e164, consent, outcome, phase, repeats_left, content_played FROM ai_recipients WHERE user_id = ? ORDER BY id DESC LIMIT 40").all(userId) as Parameters<typeof mapRecipient>[0][]).map(mapRecipient);
}

export function recipientBlockers(userId: number, recipient: RecipientRow, campaign: CampaignRow) {
  const purpose = listPurposes().find((item) => item.code === campaign.purposeCode);
  const clip = getDb().prepare("SELECT id FROM ai_clips WHERE id = ? AND user_id = ? AND status = 'ready'").get(campaign.clipId, userId);
  const suppressed = Boolean(getDb().prepare("SELECT e164 FROM ai_suppressions WHERE user_id = ? AND e164 = ?").get(userId, recipient.e164));
  return dialBlockers({
    serviceOn: serviceOn(userId),
    clipReady: Boolean(clip),
    businessName: campaign.businessName,
    callerId: campaign.callerId,
    consent: recipient.consent,
    number: recipient.e164,
    suppressed: suppressed || recipient.outcome === "opted_out",
    purposeEnabled: Boolean(purpose?.enabled),
    promotional: Boolean(purpose?.promotional),
    promoAllowed: notifyPolicy().promoEnabled,
    hoursOpen: hoursOpen(new Date(), notifyPolicy()),
  });
}

export function addRecipient(userId: number, campaignId: number, personName: string, number: string, consent: string, actor: string) {
  const campaign = listCampaigns(userId).find((item) => item.id === campaignId);
  if (!campaign) return { ok: false as const, message: "Choose a notification on this account." };
  const e164 = normalizeMobile(number);
  if (!e164) return { ok: false as const, message: "Enter a valid phone number." };
  const note = consent.trim().slice(0, 400);
  if (!note) return { ok: false as const, message: "Record how this person gave permission. A checkbox is not enough." };
  const stopped = Boolean(getDb().prepare("SELECT e164 FROM ai_suppressions WHERE user_id = ? AND e164 = ?").get(userId, e164));
  const created = getDb().prepare(
    `INSERT INTO ai_recipients (campaign_id, user_id, person_name, e164, consent, outcome, phase, repeats_left, content_played, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(campaignId, userId, personName.trim().slice(0, 80), e164, note, stopped ? "opted_out" : "pending", stopped ? "done" : "idle", notifyPolicy().repeats, new Date().toISOString());
  audit(actor, "ai.notify.recipient", String(created.lastInsertRowid));
  return { ok: true as const, id: Number(created.lastInsertRowid) };
}

function writeState(recipientId: number, state: ListenState) {
  getDb().prepare("UPDATE ai_recipients SET outcome = ?, phase = ?, repeats_left = ?, content_played = ?, updated_at = ? WHERE id = ?")
    .run(state.outcome, state.phase, state.repeatsLeft, state.contentPlayed ? 1 : 0, new Date().toISOString(), recipientId);
  getDb().prepare("INSERT INTO ai_listen_events (recipient_id, event, outcome, created_at) VALUES (?, ?, ?, ?)")
    .run(recipientId, state.phase, state.outcome, new Date().toISOString());
}

export function practiceRecipient(userId: number, recipientId: number, event: ListenEvent, actor: string) {
  const recipient = listRecipients(userId).find((item) => item.id === recipientId);
  if (!recipient) return { ok: false as const, message: "That person is not on this account." };
  const campaign = listCampaigns(userId).find((item) => item.id === recipient.campaignId);
  if (!campaign) return { ok: false as const, message: "That notification is not on this account." };
  if (recipient.phase === "done") return { ok: false as const, message: "This result is already recorded." };
  const reasons = recipientBlockers(userId, recipient, campaign);
  if (recipient.phase !== "message" && !practiceAllowed(reasons)) return { ok: false as const, message: reasons.find((reason) => reason !== "Outbound calling is not connected yet.") || reasons[0] };
  let state: ListenState = { phase: recipient.phase, outcome: recipient.outcome, repeatsLeft: recipient.repeatsLeft, contentPlayed: recipient.contentPlayed };
  if (state.phase === "idle") state = startListen(notifyPolicy().repeats);
  const next = applyListen(state, event);
  writeState(recipient.id, next.state);
  if (next.suppress) {
    getDb().prepare("INSERT INTO ai_suppressions (user_id, e164, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, e164) DO NOTHING")
      .run(userId, recipient.e164, new Date().toISOString());
    const others = getDb().prepare("SELECT id FROM ai_recipients WHERE user_id = ? AND e164 = ? AND id != ? AND phase != 'done'").all(userId, recipient.e164, recipient.id) as { id: number }[];
    for (const other of others) writeState(other.id, { phase: "done", outcome: "opted_out", repeatsLeft: 0, contentPlayed: false });
  }
  audit(actor, "ai.notify.practice", `${recipient.id}:${next.state.outcome}`);
  return { ok: true as const, outcome: next.state.outcome, contentPlayed: next.state.contentPlayed };
}
