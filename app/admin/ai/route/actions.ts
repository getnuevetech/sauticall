"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { saveCustomerRoute } from "@/lib/ai-route-store";

function done(query: string): never {
  redirect(`/admin/ai/route?${query}`);
}

export async function saveRouteForm(formData: FormData) {
  const user = await requirePermission("settings.ai");
  const result = saveCustomerRoute(Number(formData.get("user_id") || 0), user.email);
  if (!result.ok) done(`error=${encodeURIComponent(result.message)}`);
  done("saved=1");
}
