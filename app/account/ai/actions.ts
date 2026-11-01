"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { guardAccount } from "@/lib/guard";
import { NOTIFICATION_ACKS, knownSwitch } from "@/lib/ai-system";
import { acceptAgreement, requestActivation, setCustomerEnabled } from "@/lib/ai-store";
import { knownAccountAi } from "@/lib/ai-account";
import { accountAiPath } from "@/lib/ai-workspace";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { paidPlan } from "@/lib/pbx";

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

function nextOf(formData: FormData, fallback: string) {
  return accountAiPath(String(formData.get("next") || ""), fallback);
}

export async function acceptAiTerms(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const feature = serviceOf(formData);
  if (!feature) redirect("/account/ai?error=Choose%20a%20service");
  const codes = feature === "notifications"
    ? NOTIFICATION_ACKS.filter((item) => formData.get(item.code) === "on").map((item) => item.code)
    : formData.get("accept") === "on" ? ["accept"] : [];
  const result = await acceptAgreement(user.id, feature, codes, await callerHash());
  const next = nextOf(formData, "/account/ai");
  if (!result.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=terms`);
}

export async function requestAiService(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const feature = serviceOf(formData);
  if (!feature) redirect("/account/ai?error=Choose%20a%20service");
  const result = requestActivation(user.id, feature);
  const next = nextOf(formData, "/account/ai");
  if (!result.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=requested`);
}

export async function saveAccountAiForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const { saveAccountAi } = await import("@/lib/ai-account-store");
  const next = nextOf(formData, "/account/ai");
  const result = saveAccountAi(user.id, paidPlan(user.id), {
    feature: String(formData.get("feature") || ""),
    displayName: String(formData.get("display_name") || ""),
    extensionId: Number(formData.get("extension_id") || 0),
  });
  if (!result.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=configured`);
}

export async function saveAccountPromptForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const feature = String(formData.get("feature") || "");
  const next = nextOf(formData, knownAccountAi(feature) ? `/account/ai/services/${feature}?tab=instructions` : "/account/ai");
  const { saveAccountPrompt } = await import("@/lib/ai-account-store");
  const result = saveAccountPrompt(user.id, paidPlan(user.id), { feature, body: String(formData.get("instructions") || "") });
  if (!result.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=prompt`);
}

export async function restoreAccountPromptForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const feature = String(formData.get("feature") || "");
  const next = nextOf(formData, knownAccountAi(feature) ? `/account/ai/services/${feature}?tab=instructions` : "/account/ai");
  const { restoreAccountPrompt } = await import("@/lib/ai-account-store");
  const result = restoreAccountPrompt(user.id, paidPlan(user.id), feature);
  if (!result.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=restored`);
}

export async function createVirtualAgentForm(formData: FormData) {
  const user = await guardAccount();
  const plan = paidPlan(user.id);
  if (!plan) redirect(PLAN_SETUP_PATH);
  const agentType = String(formData.get("agent_type") || "");
  const feature = knownAccountAi(agentType) ? (await import("@/lib/ai-account")).accountAiFeature(agentType) : "";
  const { planAllows } = await import("@/lib/plan-features");
  const next = nextOf(formData, "/account/ai");
  if (!feature || !planAllows(plan, feature)) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent("That AI extension is not included on this plan.")}`);
  const { getDb } = await import("@/lib/db");
  const { publishVirtualAgent, saveVirtualAgent } = await import("@/lib/ai-virtual-store");
  const now = new Date().toISOString();
  const saved = saveVirtualAgent(getDb(), {
    userId: user.id,
    name: String(formData.get("name") || ""),
    agentType,
    engine: String(formData.get("engine") || ""),
    greeting: String(formData.get("greeting") || ""),
    instructions: String(formData.get("instructions") || ""),
    did: String(formData.get("did") || ""),
    language: String(formData.get("language") || "en-US"),
    allowedTransfers: String(formData.get("transfers") || "").split(",").map((item) => item.trim()).filter(Boolean),
    now,
  });
  if (!saved.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(saved.message)}`);
  const published = publishVirtualAgent(getDb(), {
    userId: user.id,
    agentId: saved.id,
    idempotencyKey: String(formData.get("request_id") || crypto.randomUUID()),
    now,
  });
  if (!published.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(published.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=extension`);
}

export async function setAiService(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const feature = serviceOf(formData);
  if (!feature) redirect("/account/ai?error=Choose%20a%20service");
  const result = setCustomerEnabled(user.id, feature, formData.get("enabled") === "on");
  const next = nextOf(formData, "/account/ai");
  if (!result.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.message)}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=service`);
}
