import crypto from "crypto";

function providerErrorText(body: string, secret: string) {
  let message = body.replace(/\s+/g, " ").trim().slice(0, 240);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") message = parsed.error.message.replace(/\s+/g, " ").trim().slice(0, 240);
  } catch {
    message = body.replace(/\s+/g, " ").trim().slice(0, 240);
  }
  if (secret) message = message.split(secret).join("[hidden]");
  return message;
}

export const AUDIO_CAPS = { maxSeconds: 180, maxBytes: 5_000_000, retentionDays: 3650, scriptLength: 2000 };

export type AudioPolicy = {
  maxSeconds: number;
  maxBytes: number;
  retentionDays: number;
  previewEnabled: boolean;
};

export function normalizePolicy(input: { maxSeconds: number; maxBytes: number; retentionDays: number; previewEnabled: boolean }) {
  const maxSeconds = Math.round(input.maxSeconds);
  const maxBytes = Math.round(input.maxBytes);
  const retentionDays = Math.round(input.retentionDays);
  if (!Number.isFinite(maxSeconds) || maxSeconds < 1 || maxSeconds > AUDIO_CAPS.maxSeconds) return { ok: false as const, message: `Maximum length must be between 1 and ${AUDIO_CAPS.maxSeconds} seconds.` };
  if (!Number.isFinite(maxBytes) || maxBytes < 1000 || maxBytes > AUDIO_CAPS.maxBytes) return { ok: false as const, message: "Maximum file size must be between 1 KB and 5 MB." };
  if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > AUDIO_CAPS.retentionDays) return { ok: false as const, message: "Retention must be between 1 and 3650 days." };
  return { ok: true as const, policy: { maxSeconds, maxBytes, retentionDays, previewEnabled: input.previewEnabled } satisfies AudioPolicy };
}

export function validateVoice(input: { name: string; voiceKey: string; rights: boolean; enabled: boolean; engineKind: string | null }) {
  const name = input.name.trim().slice(0, 80);
  const voiceKey = input.voiceKey.trim().slice(0, 80);
  if (!name) return { ok: false as const, message: "Enter a name for this voice." };
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(voiceKey)) return { ok: false as const, message: "The voice key can use letters, numbers, and . _ : -." };
  if (input.engineKind && input.engineKind !== "tts") return { ok: false as const, message: "Choose a text-to-voice engine, or leave the engine blank for the preview tone." };
  if (input.enabled && !input.rights) return { ok: false as const, message: "Confirm the right to use this voice before turning it on." };
  return { ok: true as const, voice: { name, voiceKey, rights: input.rights, enabled: input.enabled && input.rights } };
}

export function scriptDigest(script: string, voiceKey: string, source: string) {
  return crypto.createHash("sha256").update(`${source}\n${voiceKey}\n${script.trim()}`).digest("hex");
}

export function retentionDue(createdAt: string, retentionDays: number, status: string, now: number) {
  if (status === "ready") return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > retentionDays * 24 * 60 * 60 * 1000;
}

function wavHeader(dataBytes: number, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

export function renderPreviewWav(script: string, maxSeconds: number) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.min(Math.max(1, maxSeconds), Math.max(1, Math.round(words * 0.4)));
  const sampleRate = 8000;
  const samples = seconds * sampleRate;
  const pcm = Buffer.alloc(samples * 2);
  const freq = 220 + (script.trim().length % 180);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.sin(Math.PI * ((i % sampleRate) / sampleRate));
    const sample = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * envelope * 7000);
    pcm.writeInt16LE(sample, i * 2);
  }
  const bytes = Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]);
  return { bytes, durationMs: seconds * 1000, mime: "audio/wav" as const };
}

type Inspected = { ok: true; durationMs: number; mime: "audio/wav" | "audio/mpeg" } | { ok: false; message: string };

function readChunk(bytes: Buffer, offset: number) {
  if (offset + 8 > bytes.length) return null;
  const id = bytes.toString("ascii", offset, offset + 4);
  const size = bytes.readUInt32LE(offset + 4);
  const start = offset + 8;
  if (size < 0 || start + size > bytes.length) return null;
  return { id, size, start, next: start + size + (size % 2) };
}

export function inspectWav(bytes: Buffer, policy: Pick<AudioPolicy, "maxSeconds" | "maxBytes">): Inspected {
  if (bytes.length > policy.maxBytes) return { ok: false, message: "This file is larger than the limit set by an administrator." };
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return { ok: false, message: "Use a WAV or MP3 file." };
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataBytes = 0;
  let offset = 12;
  for (let guard = 0; guard < 16; guard++) {
    const chunk = readChunk(bytes, offset);
    if (!chunk) break;
    if (chunk.id === "fmt " && chunk.size >= 16) {
      format = bytes.readUInt16LE(chunk.start);
      channels = bytes.readUInt16LE(chunk.start + 2);
      sampleRate = bytes.readUInt32LE(chunk.start + 4);
      bits = bytes.readUInt16LE(chunk.start + 14);
    }
    if (chunk.id === "data") dataBytes = chunk.size;
    offset = chunk.next;
  }
  if (format !== 1 || (channels !== 1 && channels !== 2) || bits !== 16 || sampleRate < 8000 || sampleRate > 48000 || dataBytes < 2) {
    return { ok: false, message: "Use a 16-bit WAV file, mono or stereo, between 8 kHz and 48 kHz." };
  }
  const durationMs = Math.round((dataBytes / (sampleRate * channels * 2)) * 1000);
  if (durationMs < 200) return { ok: false, message: "The audio is too short to keep." };
  if (durationMs > policy.maxSeconds * 1000) return { ok: false, message: `Audio must be ${policy.maxSeconds} seconds or shorter.` };
  return { ok: true, durationMs, mime: "audio/wav" };
}

const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

function skipId3(bytes: Buffer) {
  if (bytes.length < 10 || bytes.toString("ascii", 0, 3) !== "ID3") return 0;
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  return Math.min(bytes.length, 10 + size);
}

export function inspectMp3(bytes: Buffer, policy: Pick<AudioPolicy, "maxSeconds" | "maxBytes">): Inspected {
  if (bytes.length > policy.maxBytes) return { ok: false, message: "This file is larger than the limit set by an administrator." };
  const start = skipId3(bytes);
  let frame = -1;
  const end = Math.min(bytes.length - 4, start + 4096);
  for (let i = start; i < end; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      frame = i;
      break;
    }
  }
  if (frame < 0) return { ok: false, message: "Use a WAV or MP3 file." };
  const version = (bytes[frame + 1] >> 3) & 0x03;
  const layer = (bytes[frame + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[frame + 2] >> 4) & 0x0f;
  const kbps = version === 3 && layer === 1 ? MPEG1_L3_KBPS[bitrateIndex] : 0;
  if (!kbps) return { ok: false, message: "Use a standard MP3 file." };
  const audioBytes = Math.max(0, bytes.length - start);
  const durationMs = Math.round((audioBytes * 8) / kbps);
  if (durationMs < 200) return { ok: false, message: "The audio is too short to keep." };
  if (durationMs > policy.maxSeconds * 1000) return { ok: false, message: `Audio must be ${policy.maxSeconds} seconds or shorter.` };
  return { ok: true, durationMs, mime: "audio/mpeg" };
}

export function inspectUpload(bytes: Buffer, policy: Pick<AudioPolicy, "maxSeconds" | "maxBytes">): Inspected {
  if (bytes.length < 16) return { ok: false, message: "Choose a WAV or MP3 file." };
  const head = bytes.subarray(0, 64).toString("utf8").toLowerCase();
  if (head.includes("<script") || head.includes("<!doctype") || head.includes("<?php")) return { ok: false, message: "That file is not audio." };
  if (bytes.toString("ascii", 0, 4) === "RIFF") return inspectWav(bytes, policy);
  return inspectMp3(bytes, policy);
}

export async function readEngineAudio(
  endpoint: string,
  payload: { text: string; voice: string; model: string },
  maxBytes: number,
  fetchImpl: typeof fetch = fetch,
  auth: { bearer?: string } = {},
) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false as const, message: "The text-to-voice address is not a valid https address." };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { ok: false as const, message: "The text-to-voice address must be https, without a password in the address." };
  const headers: Record<string, string> = { "content-type": "application/json", accept: "audio/wav, audio/mpeg" };
  if (auth.bearer) headers.authorization = `Bearer ${auth.bearer}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false as const, message: "The text-to-voice engine did not respond. No audio was stored." };
  }
  if (!response.ok) {
    const detail = providerErrorText(await response.text(), auth.bearer || "");
    return { ok: false as const, message: detail ? `The text-to-voice engine did not return audio. ${detail}` : "The text-to-voice engine did not return audio. No audio was stored." };
  }
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const mime = type === "audio/mpeg" || type === "audio/mp3" ? "audio/mpeg" : type === "audio/wav" || type === "audio/wave" || type === "audio/x-wav" ? "audio/wav" : "";
  if (!mime) return { ok: false as const, message: "The text-to-voice engine returned something other than audio. No audio was stored." };
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) return { ok: false as const, message: "The audio is larger than the limit set by an administrator." };
  return { ok: true as const, bytes, mime };
}
