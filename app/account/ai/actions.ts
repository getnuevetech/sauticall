"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { guardAccount } from "@/lib/guard";
import { NOTIFICATION_ACKS, knownSwitch } from "@/lib/ai-system";
import { acceptAgreement, requestActivation, setCustomerEnabled } from "@/lib/ai-store";

async function callerHash() {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for") || headerList.get("x-real-ip") || "";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function serviceOf(formData: FormData) {
  const feature = String(formData.get("feature") || "");
  if (!knownSwitch(feature) || feature === "master") return "";
  return feature;
}

export async function acceptAiTerms(formData: FormData) {
  const user = await guardAccount();
  const feature = serviceOf(formData);
  if (!feature) redirect("/account/ai?error=Choose%20a%20service");
  const codes = feature === "notifications"
    ? NOTIFICATION_ACKS.filter((item) => formData.get(item.code) === "on").map((item) => item.code)
    : formData.get("accept") === "on" ? ["accept"] : [];
  const result = await acceptAgreement(user.id, feature, codes, await callerHash());
  if (!result.ok) redirect(`/account/ai?error=${encodeURIComponent(result.message)}`);
  redirect("/account/ai?saved=terms");
}

export async function requestAiService(formData: FormData) {
  const user = await guardAccount();
  const feature = serviceOf(formData);
  if (!feature) redirect("/account/ai?error=Choose%20a%20service");
  const result = requestActivation(user.id, feature);
  if (!result.ok) redirect(`/account/ai?error=${encodeURIComponent(result.message)}`);
  redirect("/account/ai?saved=requested");
}

export async function saveAccountAiForm(formData: FormData) {
  const user = await guardAccount();
  const { paidPlan } = await import("@/lib/pbx");
  const { saveAccountAi } = await import("@/lib/ai-account-store");
  const result = saveAccountAi(user.id, paidPlan(user.id), {
    feature: String(formData.get("feature") || ""),
    displayName: String(formData.get("display_name") || ""),
    greeting: String(formData.get("greeting") || ""),
    extensionId: Number(formData.get("extension_id") || 0),
  });
  if (!result.ok) redirect(`/account/ai?error=${encodeURIComponent(result.message)}`);
  redirect("/account/ai?saved=configured");
}

export async function setAiService(formData: FormData) {
  const user = await guardAccount();
  const feature = serviceOf(formData);
  if (!feature) redirect("/account/ai?error=Choose%20a%20service");
  const result = setCustomerEnabled(user.id, feature, formData.get("enabled") === "on");
  if (!result.ok) redirect(`/account/ai?error=${encodeURIComponent(result.message)}`);
  redirect("/account/ai?saved=service");
}
