"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { deleteVoice, saveAudioPolicy, saveVoice } from "@/lib/ai-audio-store";

function done(query: string): never {
  redirect(`/admin/ai/audio?${query}`);
}

export async function saveAudioPolicyForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const megabytes = Number(formData.get("max_mb") || 0);
  const result = saveAudioPolicy({
    maxSeconds: Number(formData.get("max_seconds") || 0),
    maxBytes: Math.round(megabytes * 1_000_000),
    retentionDays: Number(formData.get("retention_days") || 0),
    previewEnabled: formData.get("preview") === "on",
  }, user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=policy");
}

export async function saveVoiceForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const engineRaw = String(formData.get("engine_id") || "");
  const result = saveVoice(null, {
    name: String(formData.get("name") || ""),
    voiceKey: String(formData.get("voice_key") || ""),
    engineId: /^\d+$/.test(engineRaw) ? Number(engineRaw) : null,
    rights: formData.get("rights") === "on",
    enabled: formData.get("enabled") === "on",
  }, user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=voice");
}

export async function removeVoiceForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const result = deleteVoice(Number(formData.get("id") || 0), user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=removed");
}
