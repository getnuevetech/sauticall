"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";
import { recordVirtualBinding } from "@/lib/ai-virtual-store";

export async function recordVirtualBindingForm(formData: FormData) {
  await requirePermission("settings.ai");
  const agentId = Number(formData.get("agent_id") || 0);
  const agent = getDb().prepare("SELECT user_id FROM ai_agents WHERE id = ?").get(agentId) as { user_id: number } | undefined;
  if (!agent) redirect("/admin/ai/destinations?error=That%20AI%20extension%20was%20not%20found.");
  const result = recordVirtualBinding(getDb(), {
    userId: agent.user_id,
    agentId,
    resourceId: String(formData.get("resource_id") || ""),
    note: String(formData.get("note") || ""),
    now: new Date().toISOString(),
  });
  if (!result.ok) redirect(`/admin/ai/destinations?error=${encodeURIComponent(result.message)}`);
  redirect("/admin/ai/destinations?saved=1");
}
