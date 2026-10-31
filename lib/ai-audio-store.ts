import crypto from "crypto";
import fs from "fs";
import path from "path";
import { inspectUpload, normalizePolicy, readEngineAudio, renderPreviewWav, retentionDue, scriptDigest, validateVoice, type AudioPolicy } from "./ai-audio";
import { enabledSwitchCodes, listAiEngines, readAiEngineSecret } from "./ai-store";
import { audit, getDb } from "./db";
import { audioDir } from "./paths";

export type VoiceRow = {
  id: number;
  name: string;
  voiceKey: string;
  engineId: number | null;
  rights: boolean;
  enabled: boolean;
};

export type ClipRow = {
  id: number;
  userId: number;
  title: string;
  script: string;
  voiceId: number | null;
  source: string;
  status: string;
  mime: string;
  byteCount: number;
  durationMs: number;
  createdAt: string;
};

function policyRow() {
  return getDb().prepare("SELECT max_seconds, max_bytes, retention_days, preview_enabled FROM ai_audio_policy WHERE id = 1").get() as {
    max_seconds: number;
    max_bytes: number;
    retention_days: number;
    preview_enabled: number;
  };
}

export function audioPolicy(): AudioPolicy {
  const row = policyRow();
  return { maxSeconds: row.max_seconds, maxBytes: row.max_bytes, retentionDays: row.retention_days, previewEnabled: row.preview_enabled === 1 };
}

export function saveAudioPolicy(input: AudioPolicy, actor: string) {
  const result = normalizePolicy(input);
  if (!result.ok) return result;
  getDb().prepare("UPDATE ai_audio_policy SET max_seconds = ?, max_bytes = ?, retention_days = ?, preview_enabled = ? WHERE id = 1")
    .run(result.policy.maxSeconds, result.policy.maxBytes, result.policy.retentionDays, result.policy.previewEnabled ? 1 : 0);
  audit(actor, "ai.audio.policy", `${result.policy.maxSeconds}s`);
  return { ok: true as const };
}

function mapVoice(row: { id: number; name: string; voice_key: string; engine_id: number | null; rights_ok: number; enabled: number }): VoiceRow {
  return { id: row.id, name: row.name, voiceKey: row.voice_key, engineId: row.engine_id, rights: row.rights_ok === 1, enabled: row.enabled === 1 };
}

export function listVoices() {
  return (getDb().prepare("SELECT id, name, voice_key, engine_id, rights_ok, enabled FROM ai_voices ORDER BY name, id").all() as {
    id: number; name: string; voice_key: string; engine_id: number | null; rights_ok: number; enabled: number;
  }[]).map(mapVoice);
}

export function saveVoice(id: number | null, input: { name: string; voiceKey: string; engineId: number | null; rights: boolean; enabled: boolean }, actor: string) {
  const engine = input.engineId ? listAiEngines().find((item) => item.id === input.engineId) : undefined;
  if (input.engineId && !engine) return { ok: false as const, message: "Choose a text-to-voice engine that is saved on this system." };
  const result = validateVoice({ name: input.name, voiceKey: input.voiceKey, rights: input.rights, enabled: input.enabled, engineKind: engine ? engine.kind : null });
  if (!result.ok) return result;
  const now = new Date().toISOString();
  if (id) {
    getDb().prepare("UPDATE ai_voices SET name = ?, voice_key = ?, engine_id = ?, rights_ok = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(result.voice.name, result.voice.voiceKey, input.engineId, result.voice.rights ? 1 : 0, result.voice.enabled ? 1 : 0, now, id);
    audit(actor, "ai.voice", String(id));
    return { ok: true as const, id };
  }
  const created = getDb().prepare("INSERT INTO ai_voices (name, voice_key, engine_id, rights_ok, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(result.voice.name, result.voice.voiceKey, input.engineId, result.voice.rights ? 1 : 0, result.voice.enabled ? 1 : 0, now);
  audit(actor, "ai.voice", String(created.lastInsertRowid));
  return { ok: true as const, id: Number(created.lastInsertRowid) };
}

export function deleteVoice(id: number, actor: string) {
  const used = getDb().prepare("SELECT id FROM ai_clips WHERE voice_id = ? LIMIT 1").get(id);
  if (used) return { ok: false as const, message: "This voice is used by saved audio. Remove that audio first." };
  getDb().prepare("DELETE FROM ai_voices WHERE id = ?").run(id);
  audit(actor, "ai.voice.delete", String(id));
  return { ok: true as const };
}

function mapClip(row: {
  id: number; user_id: number; title: string; script: string; voice_id: number | null; source: string; status: string; mime: string; byte_count: number; duration_ms: number; created_at: string;
}): ClipRow {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    script: row.script,
    voiceId: row.voice_id,
    source: row.source,
    status: row.status,
    mime: row.mime,
    byteCount: row.byte_count,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

const CLIP_SQL = "SELECT id, user_id, title, script, voice_id, source, status, mime, byte_count, duration_ms, created_at FROM ai_clips";

export function listClips(userId: number) {
  sweepExpired();
  return (getDb().prepare(`${CLIP_SQL} WHERE user_id = ? ORDER BY id DESC LIMIT 40`).all(userId) as Parameters<typeof mapClip>[0][]).map(mapClip);
}

export function listRecentClips() {
  sweepExpired();
  return (getDb().prepare(`${CLIP_SQL} ORDER BY id DESC LIMIT 30`).all() as Parameters<typeof mapClip>[0][]).map(mapClip);
}

function clipFile(storageName: string) {
  const root = path.resolve(audioDir());
  const full = path.resolve(root, storageName);
  if (full !== root && !full.startsWith(root + path.sep)) return "";
  return full;
}

function writeClip(userId: number, bytes: Buffer, mime: string) {
  const ext = mime === "audio/mpeg" ? "mp3" : "wav";
  const storageName = `${userId}/${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const full = clipFile(storageName);
  if (!full) throw new Error("audio path");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
  return storageName;
}

function remember(userId: number, title: string, script: string, voiceId: number | null, source: string, digest: string, mime: string, bytes: Buffer, durationMs: number) {
  const existing = getDb().prepare("SELECT id FROM ai_clips WHERE user_id = ? AND digest = ? ORDER BY id DESC LIMIT 1").get(userId, digest) as { id: number } | undefined;
  if (existing) return { id: existing.id, reused: true };
  const storageName = writeClip(userId, bytes, mime);
  const created = getDb().prepare(
    `INSERT INTO ai_clips (user_id, title, script, voice_id, source, status, digest, mime, byte_count, duration_ms, storage_name, created_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
  ).run(userId, title, script, voiceId, source, digest, mime, bytes.length, durationMs, storageName, new Date().toISOString());
  return { id: Number(created.lastInsertRowid), reused: false };
}

export async function generateClip(userId: number, title: string, script: string, voiceId: number, actor: string) {
  const cleanTitle = title.trim().slice(0, 80);
  const cleanScript = script.trim().slice(0, 2000);
  if (!cleanTitle) return { ok: false as const, message: "Enter a name for this audio." };
  if (!cleanScript) return { ok: false as const, message: "Enter the words to store." };
  const voice = listVoices().find((item) => item.id === voiceId);
  if (!voice || !voice.enabled || !voice.rights) return { ok: false as const, message: "Choose a voice an administrator has turned on." };
  if (!enabledSwitchCodes().has("master")) return { ok: false as const, message: "SautiCall has turned audio generation off." };
  const policy = audioPolicy();
  if (voice.engineId) {
    const engine = listAiEngines().find((item) => item.id === voice.engineId && item.enabled);
    if (!engine) return { ok: false as const, message: "The text-to-voice engine for this voice is off." };
    const spoken = await readEngineAudio(
      engine.endpoint,
      { text: cleanScript, voice: voice.voiceKey, model: engine.model },
      policy.maxBytes,
      fetch,
      { bearer: readAiEngineSecret(engine.id) },
    );
    if (!spoken.ok) return spoken;
    const checked = inspectUpload(spoken.bytes, policy);
    if (!checked.ok) return checked;
    const saved = remember(userId, cleanTitle, cleanScript, voice.id, "engine", scriptDigest(cleanScript, `${voice.voiceKey}:${engine.id}:${engine.model}`, "engine"), checked.mime, spoken.bytes, checked.durationMs);
    audit(actor, "ai.audio.generate", `${saved.id}:${saved.reused ? "reused" : "engine"}`);
    return { ok: true as const, ...saved, source: "engine" as const };
  }
  if (!policy.previewEnabled) return { ok: false as const, message: "This voice has no text-to-voice engine, and the preview tone is off." };
  const preview = renderPreviewWav(cleanScript, policy.maxSeconds);
  const checked = inspectUpload(preview.bytes, policy);
  if (!checked.ok) return checked;
  const saved = remember(userId, cleanTitle, cleanScript, voice.id, "preview", scriptDigest(cleanScript, voice.voiceKey, "preview"), checked.mime, preview.bytes, checked.durationMs);
  audit(actor, "ai.audio.generate", `${saved.id}:${saved.reused ? "reused" : "preview"}`);
  return { ok: true as const, ...saved, source: "preview" as const };
}

export function storeUpload(userId: number, title: string, bytes: Buffer, actor: string) {
  const cleanTitle = title.trim().slice(0, 80);
  if (!cleanTitle) return { ok: false as const, message: "Enter a name for this audio." };
  const policy = audioPolicy();
  const checked = inspectUpload(bytes, policy);
  if (!checked.ok) return checked;
  const digest = scriptDigest(bytes.toString("base64"), String(userId), "upload");
  const saved = remember(userId, cleanTitle, "", null, "upload", digest, checked.mime, bytes, checked.durationMs);
  audit(actor, "ai.audio.upload", String(saved.id));
  return { ok: true as const, ...saved };
}

export function markClipReady(userId: number, clipId: number, actor: string) {
  const row = getDb().prepare("SELECT id, status FROM ai_clips WHERE id = ? AND user_id = ?").get(clipId, userId) as { id: number; status: string } | undefined;
  if (!row) return { ok: false as const, message: "That audio is not on this account." };
  getDb().prepare("UPDATE ai_clips SET status = 'ready' WHERE id = ?").run(clipId);
  audit(actor, "ai.audio.ready", String(clipId));
  return { ok: true as const };
}

export function readClip(clipId: number, userId: number, staff: boolean) {
  const row = getDb().prepare("SELECT user_id, mime, storage_name FROM ai_clips WHERE id = ?").get(clipId) as { user_id: number; mime: string; storage_name: string } | undefined;
  if (!row || (!staff && row.user_id !== userId)) return null;
  const full = clipFile(row.storage_name);
  if (!full || !fs.existsSync(full)) return null;
  return { mime: row.mime, bytes: fs.readFileSync(full) };
}

export function sweepExpired() {
  const policy = audioPolicy();
  const rows = getDb().prepare("SELECT id, status, storage_name, created_at FROM ai_clips WHERE status != 'ready'").all() as { id: number; status: string; storage_name: string; created_at: string }[];
  const now = Date.now();
  for (const row of rows) {
    if (!retentionDue(row.created_at, policy.retentionDays, row.status, now)) continue;
    const full = clipFile(row.storage_name);
    if (full && fs.existsSync(full)) fs.unlinkSync(full);
    getDb().prepare("DELETE FROM ai_clips WHERE id = ?").run(row.id);
  }
}
