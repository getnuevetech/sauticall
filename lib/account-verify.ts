import { confirmationMail } from "./confirmation-mail";
import { addressReady, getEmergency } from "./e911";
import { flagOn, getDb } from "./db";
import { recordFailure } from "./failure-log";
import { sendSms, smsReady } from "./sms";
import { acceptsTestCode, challengeOpen, codeSalt, codesMatch, digest, hashCode, newCode, newToken } from "./verify-code";

const EMAIL_MS = 30 * 60 * 1000;
const SMS_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;

type Challenge = {
  id: number;
  user_id: number;
  channel: string;
  code_hash: string;
  salt: string;
  token_hash: string;
  expires_at: string;
  attempts: number;
  used_at: string;
  created_at: string;
};

type Account = { id: number; email: string; name: string; phone: string; email_verified_at: string; phone_verified_at: string };

function account(userId: number) {
  return getDb().prepare("SELECT id, email, name, phone, email_verified_at, phone_verified_at FROM users WHERE id = ?").get(userId) as Account | undefined;
}

function latest(userId: number, channel: string) {
  return getDb()
    .prepare("SELECT * FROM verification_challenges WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT 1")
    .get(userId, channel) as Challenge | undefined;
}

function tooSoon(row: Challenge | undefined) {
  if (!row || row.used_at) return false;
  return Date.now() - Date.parse(row.created_at) < RESEND_MS;
}

export function verificationStatus(userId: number) {
  const row = account(userId);
  return {
    email: row?.email || "",
    phone: row?.phone || "",
    emailVerified: Boolean(row?.email_verified_at),
    phoneVerified: Boolean(row?.phone_verified_at),
    emailRequired: flagOn("auth.verify_email"),
    smsRequired: flagOn("auth.verify_sms"),
    addressSaved: addressReady(row ? getEmergency(userId) : null),
    smsReady: smsReady(),
  };
}

function saveChallenge(input: { userId: number; channel: string; destination: string; code: string; token?: string; ttl: number }) {
  const salt = codeSalt();
  const expires = new Date(Date.now() + input.ttl).toISOString();
  const info = getDb()
    .prepare("INSERT INTO verification_challenges (user_id, channel, destination, code_hash, salt, token_hash, expires_at, attempts, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', ?)")
    .run(input.userId, input.channel, input.destination, hashCode(input.code, salt), salt, input.token ? digest(input.token) : "", expires, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

function dropUnsent(challengeId: number) {
  getDb().prepare("DELETE FROM verification_challenges WHERE id = ? AND used_at = ''").run(challengeId);
}

export function issueEmailChallenge(userId: number) {
  const user = account(userId);
  if (!user) return { ok: false as const, message: "That account was not found." };
  if (user.email_verified_at) return { ok: true as const, already: true as const, message: "Email is already confirmed." };
  if (tooSoon(latest(userId, "email"))) return { ok: false as const, message: "Wait a minute before sending another email." };
  const code = newCode();
  const token = newToken();
  const challengeId = saveChallenge({ userId, channel: "email", destination: user.email, code, token, ttl: EMAIL_MS });
  return { ok: true as const, already: false as const, code, token, email: user.email, name: user.name, challengeId };
}

export function issueSmsChallenge(userId: number) {
  const user = account(userId);
  if (!user?.phone) return { ok: false as const, message: "Add a mobile number first." };
  if (user.phone_verified_at) return { ok: true as const, already: true as const, message: "Mobile number is already confirmed." };
  if (tooSoon(latest(userId, "sms"))) return { ok: false as const, message: "Wait a minute before sending another code." };
  const code = newCode();
  saveChallenge({ userId, channel: "sms", destination: user.phone, code, ttl: SMS_MS });
  return { ok: true as const, already: false as const, code, phone: user.phone };
}

function emailFailed(userId: number, email: string, challengeId: number, detail: string) {
  dropUnsent(challengeId);
  recordFailure({ area: "email", userId, subject: email, detail });
  const setup = detail.startsWith("Outgoing email is not set up");
  const slow = detail.startsWith("The mail server took too long");
  const message = setup ? detail : slow ? "The mail server took too long. Try again shortly." : "The confirmation email could not be sent. Try again shortly.";
  return { ok: false as const, message };
}

export async function sendAccountEmail(userId: number, origin: string) {
  if (flagOn("auth.test_code")) {
    const user = account(userId);
    if (!user) return { ok: false as const, message: "That account was not found." };
    if (user.email_verified_at) return { ok: true as const, already: true as const, message: "Email is already confirmed." };
    return { ok: true as const, message: "Enter 123456 to confirm this email." };
  }
  const issued = issueEmailChallenge(userId);
  if (!issued.ok || issued.already) return issued;
  const { mailSettings } = await import("./tickets");
  const { sendMail } = await import("./smtp");
  const settings = mailSettings();
  if (!settings?.smtp_host || !settings.smtp_from) return emailFailed(userId, issued.email, issued.challengeId, "Outgoing email is not set up, so the confirmation was not sent.");
  const link = `${origin}/account/verify?token=${issued.token}`;
  const mail = confirmationMail({ name: issued.name, code: issued.code, link });
  const result = await sendMail({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    user: settings.smtp_user,
    pass: settings.smtp_pass,
    secure: settings.smtp_secure === 1,
    from: settings.smtp_from,
    to: [issued.email],
    subject: mail.subject,
    text: mail.text,
    messageId: `sc-verify-${userId}-${digest(issued.token).slice(0, 12)}@sauticall`,
  });
  if (!result.ok) return emailFailed(userId, issued.email, issued.challengeId, result.message);
  return { ok: true as const, message: "Confirmation email sent." };
}

export async function sendAccountSms(userId: number) {
  if (flagOn("auth.test_code")) {
    const user = account(userId);
    if (!user?.phone) return { ok: false as const, message: "Add a mobile number first." };
    if (user.phone_verified_at) return { ok: true as const, already: true as const, message: "Mobile number is already confirmed." };
    return { ok: true as const, message: "Enter 123456 to confirm this mobile number." };
  }
  const issued = issueSmsChallenge(userId);
  if (!issued.ok || issued.already) return issued;
  const sent = await sendSms({ userId, to: issued.phone, body: `Your SautiCall code is ${issued.code}. It expires in 10 minutes.` });
  return sent.ok ? { ok: true as const, message: "A code was texted to your mobile number." } : { ok: false as const, message: sent.message };
}

function openChallenge(row: Challenge) {
  return challengeOpen({ expiresAt: row.expires_at, usedAt: row.used_at, attempts: row.attempts });
}

function queueDefaultAccount(userId: number) {
  void import("./later").then(({ finishAfterResponse }) => {
    finishAfterResponse(() => import("./default-account").then(({ ensureDefaultAccount }) => ensureDefaultAccount(userId)));
  });
}

function finish(row: Challenge, column: "email_verified_at" | "phone_verified_at") {
  const now = new Date().toISOString();
  getDb().prepare("UPDATE verification_challenges SET used_at = ? WHERE id = ?").run(now, row.id);
  getDb().prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(now, row.user_id);
  queueDefaultAccount(row.user_id);
}

export function confirmEmailToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return { ok: false as const, message: "That confirmation link is not valid." };
  const row = getDb().prepare("SELECT * FROM verification_challenges WHERE channel = 'email' AND token_hash = ?").get(digest(token)) as Challenge | undefined;
  if (!row) return { ok: false as const, message: "That confirmation link is not valid." };
  if (row.used_at) return { ok: true as const, message: "Email is already confirmed." };
  if (!openChallenge(row)) return { ok: false as const, message: "That confirmation link has expired. Sign in and send a new one." };
  finish(row, "email_verified_at");
  return { ok: true as const, message: "Email confirmed." };
}

function confirmCode(userId: number, channel: "email" | "sms", code: string) {
  const cleaned = code.replace(/\s/g, "");
  const column = channel === "email" ? "email_verified_at" : "phone_verified_at";
  const person = account(userId);
  const already = channel === "email" ? person?.email_verified_at : person?.phone_verified_at;
  if (already) return { ok: true as const, message: channel === "email" ? "Email is already confirmed." : "Mobile number is already confirmed." };
  if (acceptsTestCode(cleaned, flagOn("auth.test_code"))) {
    if (channel === "sms" && !person?.phone) return { ok: false as const, message: "Add a mobile number first." };
    const now = new Date().toISOString();
    const open = latest(userId, channel);
    if (open && !open.used_at) getDb().prepare("UPDATE verification_challenges SET used_at = ? WHERE id = ?").run(now, open.id);
    getDb().prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(now, userId);
    queueDefaultAccount(userId);
    return { ok: true as const, message: channel === "email" ? "Email confirmed." : "Mobile number confirmed." };
  }
  const row = latest(userId, channel);
  if (!row) return { ok: false as const, message: "Send a new code first." };
  if (row.used_at) return { ok: true as const, message: channel === "email" ? "Email is already confirmed." : "Mobile number is already confirmed." };
  if (!openChallenge(row)) return { ok: false as const, message: "That code has expired. Send a new one." };
  if (!/^\d{6}$/.test(cleaned) || !codesMatch(cleaned, row.salt, row.code_hash)) {
    getDb().prepare("UPDATE verification_challenges SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return { ok: false as const, message: "That code is not valid." };
  }
  finish(row, column);
  return { ok: true as const, message: channel === "email" ? "Email confirmed." : "Mobile number confirmed." };
}

export function confirmEmailCode(userId: number, code: string) {
  return confirmCode(userId, "email", code);
}

export function confirmSmsCode(userId: number, code: string) {
  return confirmCode(userId, "sms", code);
}
