import { audit, getDb } from "./db";
import { awsPutRequest, googleAssertion, recordingDestination, recordingObjectKey, validateRecording, type RecordingConfig, type RecordingProvider } from "./recording-target";

type SettingsRow = {
  provider: string;
  bucket: string;
  region: string;
  prefix: string;
  aws_access_key: string;
  aws_secret: string;
  google_email: string;
  google_key: string;
  retention_days: number;
};

function row(): SettingsRow {
  return getDb().prepare("SELECT provider, bucket, region, prefix, aws_access_key, aws_secret, google_email, google_key, retention_days FROM recording_settings WHERE id = 1").get() as SettingsRow;
}

export function recordingConfig(): RecordingConfig {
  const saved = row();
  const provider: RecordingProvider = saved.provider === "aws" || saved.provider === "google" ? saved.provider : "off";
  return {
    provider,
    bucket: saved.bucket,
    region: saved.region,
    prefix: saved.prefix || "recordings",
    awsAccessKey: saved.aws_access_key,
    awsSecret: saved.aws_secret,
    googleEmail: saved.google_email,
    googleKey: saved.google_key,
    retentionDays: saved.retention_days || 365,
  };
}

export function recordingPublic() {
  const config = recordingConfig();
  return {
    provider: config.provider,
    bucket: config.bucket,
    region: config.region,
    prefix: config.prefix,
    retentionDays: config.retentionDays,
    awsKeyStored: Boolean(config.awsAccessKey),
    awsSecretStored: Boolean(config.awsSecret),
    googleEmail: config.provider === "google" ? config.googleEmail : "",
    googleKeyStored: Boolean(config.googleKey),
    destination: config.provider === "off" ? "" : recordingDestination(config, config.prefix),
  };
}

export function saveRecordingConfig(input: RecordingConfig, actor: string) {
  const current = recordingConfig();
  const next = validateRecording({
    ...input,
    awsAccessKey: input.awsAccessKey.trim() || current.awsAccessKey,
    awsSecret: input.awsSecret.trim() || current.awsSecret,
    googleKey: input.googleKey.trim() || current.googleKey,
  });
  if (!next.ok) return next;
  const config = next.config;
  getDb().prepare(
    `UPDATE recording_settings
     SET provider = ?, bucket = ?, region = ?, prefix = ?, aws_access_key = ?, aws_secret = ?, google_email = ?, google_key = ?, retention_days = ?
     WHERE id = 1`,
  ).run(config.provider, config.bucket, config.region, config.prefix, config.awsAccessKey, config.awsSecret, config.googleEmail, config.googleKey, config.retentionDays);
  audit(actor, "recordings.config", config.provider);
  return { ok: true as const };
}

async function upload(config: RecordingConfig, objectKey: string, body: Buffer, contentType: string) {
  if (config.provider === "aws") {
    const request = awsPutRequest({ config, objectKey, body, contentType, now: new Date() });
    const response = await fetch(request.url, { method: "PUT", headers: request.headers, body: new Uint8Array(body) });
    if (!response.ok) return { ok: false as const, message: `Amazon S3 returned ${response.status}.` };
    return { ok: true as const };
  }
  const assertion = googleAssertion(config.googleEmail, config.googleKey, Date.now());
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) return { ok: false as const, message: `Google sign-in returned ${tokenResponse.status}.` };
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(config.bucket)}/o?uploadType=media&name=${encodeURIComponent(objectKey)}`;
  const stored = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${tokenBody.access_token}`, "content-type": contentType }, body: new Uint8Array(body) });
  if (!stored.ok) return { ok: false as const, message: `Google Cloud Storage returned ${stored.status}.` };
  return { ok: true as const };
}

export async function storeRecording(input: { userId?: number; customerCode?: string; kind?: string; body: Buffer; contentType: string; extension: string }) {
  const config = recordingConfig();
  if (config.provider === "off") return { ok: false as const, message: "Recorded message storage is off. Choose Amazon S3 or Google Cloud Storage first." };
  const checked = validateRecording(config);
  if (!checked.ok) return checked;
  const created = getDb().prepare(
    "INSERT INTO recordings (user_id, customer_code, kind, object_key, provider, bucket, status, detail, byte_count, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)",
  ).run(input.userId || 0, input.customerCode || "", (input.kind || "message").slice(0, 40), "pending", config.provider, config.bucket, input.body.length, new Date().toISOString());
  const id = Number(created.lastInsertRowid);
  const objectKey = recordingObjectKey(config.prefix, input.customerCode || "", id, input.extension);
  getDb().prepare("UPDATE recordings SET object_key = ? WHERE id = ?").run(objectKey, id);
  try {
    const sent = await upload(config, objectKey, input.body, input.contentType);
    getDb().prepare("UPDATE recordings SET status = ?, detail = ? WHERE id = ?").run(sent.ok ? "stored" : "failed", sent.ok ? "" : sent.message, id);
    return sent.ok ? { ok: true as const, id, destination: recordingDestination(config, objectKey) } : { ok: false as const, message: sent.message };
  } catch {
    getDb().prepare("UPDATE recordings SET status = 'failed', detail = ? WHERE id = ?").run("The storage service did not answer.", id);
    return { ok: false as const, message: "The storage service did not answer." };
  }
}

export function recentRecordings() {
  return getDb().prepare(
    "SELECT id, customer_code, kind, object_key, provider, bucket, status, detail, byte_count, created_at FROM recordings ORDER BY id DESC LIMIT 12",
  ).all() as { id: number; customer_code: string; kind: string; object_key: string; provider: string; bucket: string; status: string; detail: string; byte_count: number; created_at: string }[];
}
