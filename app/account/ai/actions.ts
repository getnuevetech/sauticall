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
  const { publishVirtualAgent, saveVirtualAgent, updateVirtualAgent } = await import("@/lib/ai-virtual-store");
  const now = new Date().toISOString();
  const name = String(formData.get("name") || "").trim();
  const existing = getDb().prepare("SELECT id, status FROM ai_agents WHERE user_id = ? AND name = ?").get(user.id, name) as { id: number; status: string } | undefined;
  if (existing && existing.status !== "DRAFT") {
    const updated = updateVirtualAgent(getDb(), {
      userId: user.id,
      agentId: existing.id,
      name,
      agentType,
      engine: String(formData.get("engine") || ""),
      greeting: String(formData.get("greeting") || ""),
      instructions: String(formData.get("instructions") || ""),
      did: String(formData.get("did") || ""),
      language: String(formData.get("language") || "en-US"),
      allowedTransfers: String(formData.get("transfers") || "").split(",").map((item) => item.trim()).filter(Boolean),
      businessSummary: String(formData.get("business_summary") || ""),
      tone: String(formData.get("tone") || ""),
      voiceLabel: String(formData.get("voice") || ""),
      afterHours: String(formData.get("after_hours") || ""),
      now,
    });
    if (!updated.ok) redirect(`${next}${next.includes("?") ? "&" : "?"}error=${encodeURIComponent(updated.message)}`);
    redirect(`/account/ai/extensions/${existing.id}?saved=updated`);
  }
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
    businessSummary: String(formData.get("business_summary") || ""),
    tone: String(formData.get("tone") || ""),
    voiceLabel: String(formData.get("voice") || ""),
    afterHours: String(formData.get("after_hours") || ""),
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

export async function updateVirtualAgentForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const agentId = Number(formData.get("agent_id") || 0);
  const { getDb } = await import("@/lib/db");
  const { updateVirtualAgent } = await import("@/lib/ai-virtual-store");
  const tab = String(formData.get("tab") || "overview");
  const next = `/account/ai/extensions/${agentId}?tab=${encodeURIComponent(tab)}`;
  const result = updateVirtualAgent(getDb(), {
    userId: user.id,
    agentId,
    name: String(formData.get("name") || ""),
    agentType: String(formData.get("agent_type") || ""),
    engine: String(formData.get("engine") || ""),
    greeting: String(formData.get("greeting") || ""),
    instructions: String(formData.get("instructions") || ""),
    did: String(formData.get("did") || ""),
    language: "en-US",
    allowedTransfers: String(formData.get("transfers") || "").split(",").map((item) => item.trim()).filter(Boolean),
    businessSummary: String(formData.get("business_summary") || ""),
    tone: String(formData.get("tone") || ""),
    voiceLabel: String(formData.get("voice") || ""),
    afterHours: String(formData.get("after_hours") || ""),
    now: new Date().toISOString(),
  });
  if (!result.ok) redirect(`${next}&error=${encodeURIComponent(result.message)}`);
  redirect(`${next}&saved=updated`);
}

export async function saveKnowledgeForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const agentId = Number(formData.get("agent_id") || 0);
  const { getDb } = await import("@/lib/db");
  const { saveKnowledge } = await import("@/lib/ai-virtual");
  const result = saveKnowledge(getDb(), { userId: user.id, agentId, body: String(formData.get("body") || ""), now: new Date().toISOString() });
  const next = `/account/ai/extensions/${agentId}?tab=knowledge`;
  if (!result.ok) redirect(`${next}&error=${encodeURIComponent(result.message)}`);
  redirect(`${next}&saved=knowledge`);
}

export async function pauseVirtualAgentForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const agentId = Number(formData.get("agent_id") || 0);
  const { getDb } = await import("@/lib/db");
  const { pauseVirtualAgent } = await import("@/lib/ai-virtual");
  const result = pauseVirtualAgent(getDb(), { userId: user.id, agentId, paused: formData.get("paused") === "on", now: new Date().toISOString() });
  const next = `/account/ai/extensions/${agentId}?tab=settings`;
  if (!result.ok) redirect(`${next}&error=${encodeURIComponent(result.message)}`);
  redirect(`${next}&saved=paused`);
}

export async function previewVirtualAgentForm(formData: FormData) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const agentId = Number(formData.get("agent_id") || 0);
  const { getDb } = await import("@/lib/db");
  const { previewVirtualAgent } = await import("@/lib/ai-virtual");
  const result = previewVirtualAgent(getDb(), { userId: user.id, agentId, utterance: String(formData.get("utterance") || ""), now: new Date().toISOString() });
  const next = `/account/ai/extensions/${agentId}?tab=test`;
  if (!result.ok) redirect(`${next}&error=${encodeURIComponent(result.message)}`);
  redirect(`${next}&saved=preview&line=${encodeURIComponent(result.text)}`);
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
