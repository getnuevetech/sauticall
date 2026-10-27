import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

const MAX_ATTEMPTS = 5;

export const TEST_VERIFICATION_CODE = "123456";

export function acceptsTestCode(code: string, enabled: boolean) {
  return enabled && code.replace(/\s/g, "") === TEST_VERIFICATION_CODE;
}

export function normalizeMobile(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newToken() {
  return randomBytes(24).toString("hex");
}

export function codeSalt() {
  return randomBytes(16).toString("hex");
}

export function hashCode(code: string, salt: string) {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function codesMatch(code: string, salt: string, hash: string) {
  const next = Buffer.from(hashCode(code, salt));
  const saved = Buffer.from(hash);
  return next.length === saved.length && timingSafeEqual(next, saved);
}

export function challengeOpen(input: { expiresAt: string; usedAt: string; attempts: number }, now = Date.now()) {
  if (input.usedAt) return false;
  if (input.attempts >= MAX_ATTEMPTS) return false;
  const expires = Date.parse(input.expiresAt);
  return Number.isFinite(expires) && expires > now;
}
