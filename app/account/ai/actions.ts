"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { saveReceptionist } from "@/lib/ai-receptionist";
import { safeCustomerError } from "@/lib/customer-message";
import { audit } from "@/lib/db";

export async function saveAiReceptionist(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const result = await saveReceptionist(user.id, {
    extra: String(formData.get("extra") || ""),
    answer: formData.get("answer") === "on",
  });
  audit(user.email, "pbx.ai", result.ok ? "saved" : result.message.slice(0, 400));
  if (!result.ok) redirect(`/account/ai?error=${encodeURIComponent(safeCustomerError(result.message, "The receptionist could not be saved. Please try again, or contact support."))}`);
  redirect("/account/ai?saved=1");
}
