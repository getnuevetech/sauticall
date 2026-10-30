import assert from "node:assert/strict";
import test from "node:test";
import { inspectUpload, normalizePolicy, readEngineAudio, renderPreviewWav, retentionDue, scriptDigest, validateVoice } from "../lib/ai-audio.ts";

const policy = { maxSeconds: 60, maxBytes: 2_000_000, retentionDays: 30, previewEnabled: true };

test("a preview tone is a short wav and the same script stays the same", () => {
  const first = renderPreviewWav("The office is closed today.", 60);
  const second = renderPreviewWav("The office is closed today.", 60);
  const checked = inspectUpload(first.bytes, policy);
  assert.equal(checked.ok && checked.mime, "audio/wav");
  if (checked.ok) assert.equal(checked.durationMs, 2000);
  assert.equal(first.bytes.equals(second.bytes), true);
  assert.equal(scriptDigest(" Hello ", "preview", "preview"), scriptDigest("Hello", "preview", "preview"));
});

test("uploads reject pages and files past the limit", () => {
  const html = Buffer.from("<!doctype html><script>alert(1)</script>");
  assert.equal(inspectUpload(html, policy).ok, false);
  const long = renderPreviewWav("one two three four five six seven eight nine ten", 2);
  const over = inspectUpload(long.bytes, { maxSeconds: 1, maxBytes: 2_000_000 });
  assert.equal(over.ok, false);
  const huge = Buffer.alloc(64, 0);
  assert.equal(inspectUpload(huge, { maxSeconds: 60, maxBytes: 32 }).ok, false);
});

test("a voice stays off until the rights box is checked", () => {
  const off = validateVoice({ name: "Preview", voiceKey: "preview", rights: false, enabled: true, engineKind: null });
  assert.equal(off.ok, false);
  const on = validateVoice({ name: "Preview", voiceKey: "preview", rights: true, enabled: true, engineKind: null });
  assert.equal(on.ok && on.voice.enabled, true);
  const language = validateVoice({ name: "Preview", voiceKey: "preview", rights: true, enabled: true, engineKind: "llm" });
  assert.equal(language.ok, false);
});

test("kept audio is not expired and drafts are", () => {
  const created = "2026-01-01T00:00:00.000Z";
  const later = Date.parse("2026-03-01T00:00:00.000Z");
  assert.equal(retentionDue(created, 30, "draft", later), true);
  assert.equal(retentionDue(created, 30, "ready", later), false);
  const limits = normalizePolicy({ maxSeconds: 0, maxBytes: 1000, retentionDays: 10, previewEnabled: false });
  assert.equal(limits.ok, false);
});

test("an engine response is stored only when it is audio", async () => {
  const tone = renderPreviewWav("Hello there friend", 60);
  const ok = await readEngineAudio("https://voice.internal.example/speak", { text: "Hello", voice: "preview", model: "sauticall-voice-1" }, 2_000_000, async () => new Response(tone.bytes, { status: 200, headers: { "content-type": "audio/wav" } }));
  assert.equal(ok.ok, true);
  const page = await readEngineAudio("https://voice.internal.example/speak", { text: "Hello", voice: "preview", model: "sauticall-voice-1" }, 2_000_000, async () => new Response("no", { status: 200, headers: { "content-type": "text/plain" } }));
  assert.equal(page.ok, false);
  const insecure = await readEngineAudio("http://voice.internal.example/speak", { text: "Hello", voice: "preview", model: "sauticall-voice-1" }, 2_000_000, async () => new Response(tone.bytes));
  assert.equal(insecure.ok, false);
});
