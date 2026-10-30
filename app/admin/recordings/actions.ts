"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { saveRecordingConfig, storeRecording } from "@/lib/recording-store";

function back(error: string): never {
  redirect(`/admin/recordings?error=${encodeURIComponent(error)}`);
}

export async function saveRecordings(formData: FormData) {
  const actor = await requirePermission("settings.connections");
  const provider = String(formData.get("provider") || "off");
  const result = saveRecordingConfig({
    provider: provider === "aws" || provider === "google" ? provider : "off",
    bucket: String(formData.get("bucket") || ""),
    region: String(formData.get("region") || ""),
    prefix: String(formData.get("prefix") || ""),
    awsAccessKey: String(formData.get("aws_access_key") || ""),
    awsSecret: String(formData.get("aws_secret") || ""),
    googleEmail: String(formData.get("google_email") || ""),
    googleKey: String(formData.get("google_key") || ""),
    retentionDays: Number(formData.get("retention_days") || 365),
  }, actor.email);
  if (!result.ok) back(result.message);
  redirect("/admin/recordings?saved=1");
}

export async function probeRecording() {
  await requirePermission("settings.connections");
  const body = Buffer.from(`SautiCall recording probe ${new Date().toISOString()}\n`);
  const result = await storeRecording({ userId: 0, customerCode: "", kind: "probe", body, contentType: "text/plain", extension: "txt" });
  if (!result.ok) back(result.message);
  redirect(`/admin/recordings?saved=${encodeURIComponent(`Probe stored at ${result.destination}`)}`);
}
