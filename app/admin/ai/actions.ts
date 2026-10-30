"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { AI_ENGINE_KINDS, AI_FUNCTIONS, AI_SWITCHES, knownFunction, knownSwitch, type AiGrant } from "@/lib/ai-system";
import { clearAiAssignment, deleteAiEngine, publishAgreement, saveAiAssignment, saveAiEngine, saveAiSwitches, setAdminGrant } from "@/lib/ai-store";

function back(query: string): never {
  redirect(`/admin/ai?${query}`);
}

export async function saveAiSwitchForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const codes = AI_SWITCHES.filter((item) => formData.get(`switch_${item.code}`) === "on").map((item) => item.code);
  saveAiSwitches(codes, user.email);
  back("saved=switches");
}

export async function saveAiEngineForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const idRaw = String(formData.get("id") || "");
  const id = /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  const kind = String(formData.get("kind") || "");
  const result = saveAiEngine(id, {
    name: String(formData.get("name") || ""),
    kind: AI_ENGINE_KINDS.includes(kind as (typeof AI_ENGINE_KINDS)[number]) ? kind : "",
    model: String(formData.get("model") || ""),
    endpoint: String(formData.get("endpoint") || ""),
    secretRef: String(formData.get("secret_ref") || ""),
    enabled: formData.get("enabled") === "on",
  }, user.email);
  if (!result.ok) back(`error=${encodeURIComponent(result.message)}${id ? `&id=${id}` : "&new=1"}`);
  back(`saved=engine&id=${result.id}`);
}

export async function removeAiEngine(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const id = Number(formData.get("id") || 0);
  const result = deleteAiEngine(id, user.email);
  if (!result.ok) back(`error=${encodeURIComponent(result.message)}&id=${id}`);
  back("saved=removed");
}

export async function saveAgreementForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const feature = String(formData.get("feature") || "");
  if (!knownSwitch(feature) || feature === "master") back("error=Choose%20a%20service");
  const result = publishAgreement(feature, String(formData.get("title") || ""), String(formData.get("body") || ""), user.email);
  if (!result.ok) redirect(`/admin/ai/terms?feature=${feature}&error=${encodeURIComponent(result.message)}`);
  redirect(`/admin/ai/terms?feature=${feature}&saved=${result.version}`);
}

export async function reviewCustomerAi(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const userId = Number(formData.get("user_id") || 0);
  const decision = String(formData.get("decision") || "");
  if (!userId || (decision !== "granted" && decision !== "suspended" && decision !== "none")) back("error=Choose%20grant%20or%20suspend");
  setAdminGrant(userId, "notifications", decision as AiGrant, user.email, decision);
  redirect("/admin/ai/access?saved=1");
}

export async function saveAiAssignmentForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const problems: string[] = [];
  for (const job of AI_FUNCTIONS) {
    const value = String(formData.get(`job_${job.code}`) || "");
    if (!value) {
      clearAiAssignment(job.code, user.email);
      continue;
    }
    if (!knownFunction(job.code)) continue;
    const result = saveAiAssignment(job.code, Number(value), user.email);
    if (!result.ok) problems.push(result.message);
  }
  if (problems.length) back(`error=${encodeURIComponent(problems[0])}`);
  back("saved=jobs");
}
