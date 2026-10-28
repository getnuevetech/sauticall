import { callVoipms, getConnection } from "./carriers";
import { getDb } from "./db";
import { smsDestination } from "./sms-number";

export function smsFromDid() {
  const connection = getConnection("voipms");
  if (!connection.enabled || !connection.hasSecret || !connection.public.api_username) return "";
  return smsDestination(connection.public.sms_did || "");
}

export function smsReady() {
  return Boolean(smsFromDid());
}

function record(userId: number, phone: string, status: "waiting" | "sent" | "failed", detail: string) {
  getDb()
    .prepare("INSERT INTO sms_outbox (user_id, phone, status, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, phone, status, detail.slice(0, 200), new Date().toISOString());
}

export async function sendSms(message: { userId: number; to: string; body: string }) {
  const from = smsFromDid();
  const destination = smsDestination(message.to);
  if (!from) {
    record(message.userId, message.to, "waiting", "Text messages are not turned on.");
    return { ok: false as const, message: "Text messages are not turned on yet. Your number is saved, and the code will be texted when they are." };
  }
  if (!destination) {
    record(message.userId, message.to, "failed", "The mobile number is outside the US and Canada.");
    return { ok: false as const, message: "Text messages can be sent to US and Canadian mobile numbers." };
  }
  if (destination === from) {
    record(message.userId, message.to, "failed", "The mobile number matches the sending number.");
    return { ok: false as const, message: "Use a different mobile number." };
  }
  const text = message.body.replace(/\s+/g, " ").trim().slice(0, 160);
  const result = await callVoipms("sendSMS", { did: from, dst: destination, message: text }, 20000);
  if (!result.ok) {
    console.error(`[sauticall] sms ${result.status}`);
    record(message.userId, message.to, "failed", result.status);
    return { ok: false as const, message: "The text message could not be sent. Try again in a minute." };
  }
  record(message.userId, message.to, "sent", "Text message accepted.");
  return { ok: true as const, message: "A code was texted to your mobile number." };
}
