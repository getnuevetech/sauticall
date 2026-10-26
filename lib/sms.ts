import { getDb } from "./db";

export function smsReady() {
  return false;
}

export async function sendSms(message: { userId: number; to: string; body: string }) {
  void message.body;
  getDb()
    .prepare("INSERT INTO sms_outbox (user_id, phone, status, detail, created_at) VALUES (?, ?, 'waiting', ?, ?)")
    .run(message.userId, message.to, "SMS is not connected yet.", new Date().toISOString());
  return { ok: false, message: "SMS is not connected yet. Your number is saved, and the code will be texted when SMS is turned on." };
}
