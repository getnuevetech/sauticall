"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  markMfaComplete,
  totpMatches,
  verifyPassword,
} from "@/lib/auth";
import { audit, flagOn, getDb } from "@/lib/db";

type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: "super_admin" | "staff" | "customer";
  mfa_secret: string | null;
};

export async function login(formData: FormData) {
  if (!flagOn("auth.password_login")) return { error: "Password sign-in is turned off by an administrator." };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return { error: "Email or password is incorrect." };
  const needsCode = flagOn("auth.mfa") && Boolean(user.mfa_secret);
  await createSession(user.id, needsCode);
  audit(user.email, "auth.login", needsCode ? "mfa-pending" : "password");
  if (needsCode) redirect("/account/login?step=code");
  if (flagOn("auth.mfa") && !user.mfa_secret) redirect("/account/security");
  redirect(user.role === "customer" ? "/account" : "/admin");
}

export async function confirmMfa(formData: FormData) {
  const user = await currentUser();
  if (!user?.mfa_secret) return { error: "Sign in again to continue." };
  const code = String(formData.get("code") || "");
  if (!totpMatches(user.mfa_secret, code)) return { error: "That code is not valid." };
  await markMfaComplete();
  audit(user.email, "auth.mfa", "ok");
  redirect(user.role === "customer" ? "/account" : "/admin");
}

export async function register(formData: FormData) {
  if (!flagOn("auth.signup")) return { error: "New registrations are turned off by an administrator." };
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!name || !email || password.length < 8) return { error: "Use your name, email, and a password of at least 8 characters." };
  try {
    getDb()
      .prepare("INSERT INTO users (email, name, password_hash, role, mfa_secret, created_at) VALUES (?, ?, ?, 'customer', NULL, ?)")
      .run(email, name, hashPassword(password), new Date().toISOString());
  } catch {
    return { error: "An account with that email already exists." };
  }
  const user = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number };
  await createSession(user.id, false);
  audit(email, "auth.register", "customer");
  redirect("/account");
}

export async function logout() {
  const user = await currentUser();
  await destroySession();
  if (user) audit(user.email, "auth.logout", "");
  redirect("/");
}

export async function enrollMfa(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("auth.mfa")) return { error: "An administrator has turned multi-factor sign-in off." };
  const secret = String(formData.get("secret") || "");
  const code = String(formData.get("code") || "");
  if (!totpMatches(secret, code)) return { error: "That code does not match this authenticator setup." };
  getDb().prepare("UPDATE users SET mfa_secret = ? WHERE id = ?").run(secret, user.id);
  await markMfaComplete();
  audit(user.email, "auth.mfa.enroll", "");
  redirect("/account");
}

export async function clearOwnMfa() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (flagOn("auth.mfa")) redirect("/account/security");
  getDb().prepare("UPDATE users SET mfa_secret = NULL WHERE id = ?").run(user.id);
  audit(user.email, "auth.mfa.clear", "");
  redirect("/account/security");
}

export async function startCheckout(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("billing.checkout")) return { error: "Checkout is turned off by an administrator." };
  const gatewayId = Number(formData.get("gatewayId"));
  const gateway = getDb().prepare("SELECT * FROM gateways WHERE id = ? AND enabled = 1").get(gatewayId) as { id: number; mode: string } | undefined;
  if (!gateway) return { error: "That payment gateway is not available." };
  const info = getDb()
    .prepare("INSERT INTO payment_attempts (user_id, gateway_id, amount_cents, currency, description, status, created_at) VALUES (?, ?, ?, 'USD', ?, 'pending', ?)")
    .run(user.id, gateway.id, 3900, "SautiCall subscription", new Date().toISOString());
  audit(user.email, "billing.checkout", String(gateway.id));
  redirect(`/pay/${info.lastInsertRowid}`);
}

export async function saveNumber(formData: FormData) {
  return saveRequest("number", formData);
}

export async function savePort(formData: FormData) {
  return saveRequest("port", formData);
}

async function saveRequest(kind: "number" | "port", formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const flag = kind === "number" ? "numbers.search" : "porting.requests";
  if (!flagOn(flag)) return { error: "An administrator has turned this request off." };
  const payload = JSON.stringify({ detail: String(formData.get("detail") || "") });
  getDb()
    .prepare("INSERT INTO account_requests (user_id, kind, payload, status, created_at) VALUES (?, ?, ?, 'submitted', ?)")
    .run(user.id, kind, payload, new Date().toISOString());
  audit(user.email, `request.${kind}`, "submitted");
  redirect(kind === "number" ? "/account/numbers?saved=1" : "/account/porting?saved=1");
}
