"use server";

import { redirect } from "next/navigation";
import { guardAccount } from "@/lib/guard";
import { addRecipient, practiceRecipient, saveCampaign } from "@/lib/ai-notify-store";
import type { ListenEvent } from "@/lib/ai-notify";

function done(query: string): never {
  redirect(`/account/ai/notifications?${query}`);
}

export async function saveCampaignForm(formData: FormData) {
  const user = await guardAccount();
  const result = saveCampaign(user.id, {
    name: String(formData.get("name") || ""),
    purposeCode: String(formData.get("purpose") || ""),
    businessName: String(formData.get("business_name") || ""),
    callerId: String(formData.get("caller_id") || ""),
    clipId: Number(formData.get("clip_id") || 0),
  }, `user:${user.id}`);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=campaign");
}

export async function addRecipientForm(formData: FormData) {
  const user = await guardAccount();
  const result = addRecipient(user.id, Number(formData.get("campaign_id") || 0), String(formData.get("person") || ""), String(formData.get("number") || ""), String(formData.get("consent") || ""), `user:${user.id}`);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=person");
}

export async function practiceForm(formData: FormData) {
  const user = await guardAccount();
  const kind = String(formData.get("event") || "");
  const event: ListenEvent = kind === "1" || kind === "2" || kind === "9"
    ? { kind: "digit", digit: kind }
    : kind === "silence" || kind === "voicemail" || kind === "busy" || kind === "no_answer" || kind === "uncertain" || kind === "finished"
      ? { kind }
      : { kind: "uncertain" };
  const result = practiceRecipient(user.id, Number(formData.get("id") || 0), event, `user:${user.id}`);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done(`saved=practice&outcome=${result.outcome}`);
}
