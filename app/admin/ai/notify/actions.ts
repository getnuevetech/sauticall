"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { deletePurpose, saveNotifyPolicy, savePurpose } from "@/lib/ai-notify-store";

function done(query: string): never {
  redirect(`/admin/ai/notify?${query}`);
}

export async function saveNotifyPolicyForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const result = saveNotifyPolicy({
    repeats: Number(formData.get("repeats") || 0),
    promoEnabled: formData.get("promo") === "on",
    windowStart: String(formData.get("window_start") || ""),
    windowEnd: String(formData.get("window_end") || ""),
    timeZone: String(formData.get("time_zone") || ""),
  }, user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=policy");
}

export async function savePurposeForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const result = savePurpose(String(formData.get("label") || ""), formData.get("promotional") === "on", formData.get("enabled") === "on", user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=purpose");
}

export async function removePurposeForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const result = deletePurpose(String(formData.get("code") || ""), user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=removed");
}
