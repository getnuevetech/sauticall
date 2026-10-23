import crypto from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

const COOKIE = "sc_session";

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = crypto.scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(verify, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string) {
  const clean = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = B32.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secretBase32: string, at = Date.now()) {
  const counter = Math.floor(at / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, "0");
}

export function totpMatches(secretBase32: string, code: string) {
  const now = Date.now();
  const cleaned = code.replace(/\s/g, "");
  return [-1, 0, 1].some((step) => totpCode(secretBase32, now + step * 30000) === cleaned);
}

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: "super_admin" | "staff" | "customer";
  mfa_secret: string | null;
  mfa_pending: number;
};

export async function createSession(userId: number, mfaPending = false) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  getDb()
    .prepare("INSERT INTO sessions (token, user_id, expires_at, mfa_pending) VALUES (?, ?, ?, ?)")
    .run(token, userId, expires, mfaPending ? 1 : 0);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SAUTICALL_COOKIE_SECURE === "1",
    path: "/",
    expires: new Date(expires),
  });
}

export async function markMfaComplete() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return;
  getDb().prepare("UPDATE sessions SET mfa_pending = 0 WHERE token = ?").run(token);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.mfa_secret, u.disabled, s.mfa_pending
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as (SessionUser & { disabled?: number }) | undefined;
  if (!row) return null;
  if (row.disabled) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return row;
}

export async function requireStaff() {
  const user = await currentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "staff")) return null;
  return user;
}
