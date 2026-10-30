"use server";

import { redirect } from "next/navigation";
import { guardAccount } from "@/lib/guard";
import { generateClip, markClipReady, storeUpload } from "@/lib/ai-audio-store";

function done(query: string): never {
  redirect(`/account/ai/audio?${query}`);
}

export async function generateAudioForm(formData: FormData) {
  const user = await guardAccount();
  const voiceId = Number(formData.get("voice_id") || 0);
  const result = await generateClip(user.id, String(formData.get("title") || ""), String(formData.get("script") || ""), voiceId, `user:${user.id}`);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done(`saved=${result.reused ? "reused" : result.source}&id=${result.id}`);
}

export async function uploadAudioForm(formData: FormData) {
  const user = await guardAccount();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1) done("error=Choose%20a%20WAV%20or%20MP3%20file.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = storeUpload(user.id, String(formData.get("title") || ""), bytes, `user:${user.id}`);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done(`saved=upload&id=${result.id}`);
}

export async function keepAudioForm(formData: FormData) {
  const user = await guardAccount();
  const result = markClipReady(user.id, Number(formData.get("id") || 0), `user:${user.id}`);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=ready");
}
