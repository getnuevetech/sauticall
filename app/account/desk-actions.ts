"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createCallGroup, removeCallGroup, setDaytimeGroup } from "@/lib/call-groups";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { safeCustomerError } from "@/lib/customer-message";
import { audit } from "@/lib/db";
import { createCustomerTicket, customerReply } from "@/lib/tickets";

async function accountUser() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  return user;
}

export async function createRingGroup(formData: FormData) {
  const user = await accountUser();
  if (!planAllows(paidPlan(user.id), "ring_groups")) redirect("/account/phone?error=Ring%20groups%20are%20not%20included%20on%20your%20plan.");
  const result = await createCallGroup({
    userId: user.id,
    kind: "ring",
    name: String(formData.get("name") || ""),
    strategy: String(formData.get("strategy") || "ring_all"),
    extensionIds: formData.getAll("extension_id").map((item) => Number(item)),
  });
  audit(user.email, "pbx.ring", result.ok ? "saved" : "failed");
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "The ring group could not be saved. Please try again, or contact support."))}`);
  redirect("/account/phone?saved=group");
}

export async function createQueue(formData: FormData) {
  const user = await accountUser();
  if (!planAllows(paidPlan(user.id), "queues")) redirect("/account/phone?error=Call%20queues%20are%20not%20included%20on%20your%20plan.");
  const result = await createCallGroup({
    userId: user.id,
    kind: "queue",
    name: String(formData.get("name") || ""),
    strategy: String(formData.get("strategy") || "hunt"),
    extensionIds: formData.getAll("extension_id").map((item) => Number(item)),
  });
  audit(user.email, "pbx.queue", result.ok ? "saved" : "failed");
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "The call queue could not be saved. Please try again, or contact support."))}`);
  redirect("/account/phone?saved=group");
}

export async function chooseDaytimeGroup(formData: FormData) {
  const user = await accountUser();
  const result = await setDaytimeGroup(user.id, Number(formData.get("group_id") || 0));
  audit(user.email, "pbx.daytime", String(formData.get("group_id") || 0));
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "Call routing could not be updated. Please try again, or contact support."))}`);
  redirect("/account/phone?saved=hours");
}

export async function deleteCallGroup(formData: FormData) {
  const user = await accountUser();
  const result = await removeCallGroup(user.id, Number(formData.get("group_id") || 0));
  audit(user.email, "pbx.group.remove", String(formData.get("group_id") || 0));
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "The group could not be removed. Please try again, or contact support."))}`);
  redirect(`/account/phone?saved=group&note=${encodeURIComponent(safeCustomerError(result.message, "Removed."))}`);
}

export async function openTicket(formData: FormData) {
  const user = await accountUser();
  const result = await createCustomerTicket(user, {
    topicId: Number(formData.get("topic_id") || 0),
    subject: String(formData.get("subject") || ""),
    body: String(formData.get("body") || ""),
    priority: String(formData.get("priority") || "normal"),
  });
  audit(user.email, "ticket.create", result.ok ? String(result.id) : "failed");
  if (!result.ok || !result.id) redirect(`/account/tickets/new?error=${encodeURIComponent(safeCustomerError(result.message, "The ticket could not be sent. Please try again, or contact support."))}`);
  redirect(`/account/tickets/${result.id}?saved=Ticket%20sent.`);
}

export async function replyToTicket(formData: FormData) {
  const user = await accountUser();
  const id = Number(formData.get("id") || 0);
  const result = await customerReply(user, id, String(formData.get("body") || ""));
  audit(user.email, "ticket.reply", String(id));
  if (!result.ok) redirect(`/account/tickets/${id}?error=${encodeURIComponent(safeCustomerError(result.message, "The reply could not be sent. Please try again, or contact support."))}`);
  redirect(`/account/tickets/${id}?saved=${encodeURIComponent("Reply sent.")}`);
}
