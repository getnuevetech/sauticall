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
  const planName = String(formData.get("plan") || "");
  const plans = (await import("@/lib/db")).readDoc<{ name: string; price: number; custom?: boolean }[]>("plans");
  const plan = plans.find((item) => item.name === planName && !item.custom && item.price > 0);
  if (!plan) return { error: "Choose a priced plan." };
  const gateway = getDb().prepare("SELECT id, currencies, secret FROM gateways WHERE id = ? AND enabled = 1").get(gatewayId) as { id: number; currencies: string; secret: string } | undefined;
  if (!gateway) return { error: "That way to pay is not available." };
  const { readGatewaySecret } = await import("@/lib/payment-keys");
  if (!readGatewaySecret(gateway.secret).key) return { error: "That way to pay is missing its API secret." };
  const amount = Math.round(plan.price * 100);
  const currency = (gateway.currencies || "USD").split(",")[0].trim().toUpperCase() || "USD";
  const info = getDb()
    .prepare("INSERT INTO payment_attempts (user_id, gateway_id, amount_cents, currency, description, status, plan_name, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
    .run(user.id, gateway.id, amount, currency, `${plan.name} monthly`, plan.name, new Date().toISOString());
  const attemptId = Number(info.lastInsertRowid);
  audit(user.email, "billing.checkout", `${gateway.id}:${plan.name}`);
  const { beginCheckout, requestOrigin } = await import("@/lib/payments");
  const started = await beginCheckout(attemptId, await requestOrigin());
  if (!started.ok) redirect(`/pay/${attemptId}?error=${encodeURIComponent(started.message)}`);
  redirect(started.url);
}

export async function saveNumber(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("numbers.search")) redirect("/account/numbers?error=An%20administrator%20has%20turned%20this%20request%20off.");
  const payload = {
    did: String(formData.get("did") || "").replace(/\D/g, ""),
    country: String(formData.get("country") || "US").slice(0, 2).toUpperCase(),
    region: String(formData.get("region") || "").trim().toUpperCase(),
    ratecenter: String(formData.get("ratecenter") || "").trim().toUpperCase(),
    detail: String(formData.get("detail") || "").trim(),
  };
  if (!payload.did && !payload.detail) redirect("/account/numbers?error=Choose%20a%20number%20or%20describe%20the%20one%20you%20want.");
  getDb()
    .prepare("INSERT INTO account_requests (user_id, kind, payload, status, created_at) VALUES (?, 'number', ?, 'requested', ?)")
    .run(user.id, JSON.stringify(payload), new Date().toISOString());
  audit(user.email, "request.number", payload.did || "described");
  redirect("/account/numbers?saved=1");
}

export async function savePort(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("porting.requests")) redirect("/account/porting?error=An%20administrator%20has%20turned%20this%20request%20off.");
  const payload = {
    numbers: String(formData.get("numbers") || "").replace(/[^\d,]/g, ""),
    country: String(formData.get("country") || "US").toUpperCase() === "CA" ? "CA" : "US",
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim(),
    statement_name: String(formData.get("statement_name") || "").trim(),
    address1: String(formData.get("address1") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim().toUpperCase(),
    zip_code: String(formData.get("zip_code") || "").trim(),
    provider_name: String(formData.get("provider_name") || "").trim(),
    provider_account: String(formData.get("provider_account") || "").trim(),
    pin: String(formData.get("pin") || "").trim(),
  };
  if (!payload.numbers || !payload.first_name || !payload.last_name || !payload.address1 || !payload.city || !payload.state || !payload.zip_code || !payload.provider_name || !payload.provider_account) {
    redirect("/account/porting?error=Number%2C%20name%2C%20service%20address%2C%20current%20carrier%2C%20and%20carrier%20account%20are%20required.");
  }
  let status = "requested";
  let providerRef = "";
  let note = "";
  if (flagOn("porting.live_submit")) {
    const { submitPort } = await import("@/lib/carriers");
    const result = await submitPort({
      port_type: payload.country === "CA" ? "2" : "1",
      numbers: payload.numbers,
      location_type: "business",
      statement_name: payload.statement_name,
      first_name: payload.first_name,
      last_name: payload.last_name,
      address1: payload.address1,
      city: payload.city,
      state: payload.state,
      zip_code: payload.zip_code,
      country: payload.country === "CA" ? "CA" : "US",
      provider_name: payload.provider_name,
      provider_account: payload.provider_account,
      pin: payload.pin,
    });
    if (result.ok) {
      status = "submitted";
      const port = result.body && typeof result.body === "object" ? (result.body as { port?: unknown }).port : "";
      providerRef = String(port || "");
    } else {
      status = "exception";
      note = result.message;
    }
  }
  getDb()
    .prepare("INSERT INTO account_requests (user_id, kind, payload, status, provider_ref, staff_note, created_at) VALUES (?, 'port', ?, ?, ?, ?, ?)")
    .run(user.id, JSON.stringify(payload), status, providerRef, note, new Date().toISOString());
  audit(user.email, "request.port", status);
  redirect("/account/porting?saved=1");
}
