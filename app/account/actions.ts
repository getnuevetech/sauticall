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
  const plans = (await import("@/lib/db")).readDoc<{ name: string; price: number; custom?: boolean; includedMinutes?: number }[]>("plans");
  const plan = plans.find((item) => item.name === planName && !item.custom && item.price > 0);
  if (!plan) return { error: "Choose a priced plan." };
  const gateway = getDb().prepare("SELECT id, currencies, secret FROM gateways WHERE id = ? AND enabled = 1").get(gatewayId) as { id: number; currencies: string; secret: string } | undefined;
  if (!gateway) return { error: "That way to pay is not available." };
  const { readGatewaySecret } = await import("@/lib/payment-keys");
  if (!readGatewaySecret(gateway.secret).key) return { error: "That way to pay is missing its API secret." };
  const amount = Math.round(plan.price * 100);
  const minutes = Math.max(0, Math.round(Number(plan.includedMinutes) || 0));
  const currency = (gateway.currencies || "USD").split(",")[0].trim().toUpperCase() || "USD";
  const info = getDb()
    .prepare("INSERT INTO payment_attempts (user_id, gateway_id, amount_cents, currency, description, status, plan_name, product_kind, product_minutes, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, 'plan', ?, ?)")
    .run(user.id, gateway.id, amount, currency, `${plan.name} monthly`, plan.name, minutes, new Date().toISOString());
  const attemptId = Number(info.lastInsertRowid);
  audit(user.email, "billing.checkout", `${gateway.id}:${plan.name}`);
  const { beginCheckout, requestOrigin } = await import("@/lib/payments");
  const started = await beginCheckout(attemptId, await requestOrigin());
  if (!started.ok) redirect(`/pay/${attemptId}?error=${encodeURIComponent(started.message)}`);
  redirect(started.url);
}

export async function startBundleCheckout(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("billing.checkout")) redirect("/account/minutes?error=Checkout%20is%20turned%20off.");
  const gatewayId = Number(formData.get("gatewayId"));
  const bundleName = String(formData.get("bundle") || "");
  const { bundleByName } = await import("@/lib/minutes");
  const bundle = bundleByName(bundleName);
  if (!bundle) redirect("/account/minutes?error=That%20minute%20bundle%20is%20not%20for%20sale.");
  const gateway = getDb().prepare("SELECT id, currencies, secret FROM gateways WHERE id = ? AND enabled = 1").get(gatewayId) as { id: number; currencies: string; secret: string } | undefined;
  if (!gateway) redirect("/account/minutes?error=That%20way%20to%20pay%20is%20not%20available.");
  const { readGatewaySecret } = await import("@/lib/payment-keys");
  if (!readGatewaySecret(gateway.secret).key) redirect("/account/minutes?error=That%20way%20to%20pay%20is%20missing%20its%20API%20secret.");
  const currency = (gateway.currencies || "USD").split(",")[0].trim().toUpperCase() || "USD";
  const info = getDb()
    .prepare("INSERT INTO payment_attempts (user_id, gateway_id, amount_cents, currency, description, status, plan_name, product_kind, product_minutes, bundle_name, created_at) VALUES (?, ?, ?, ?, ?, 'pending', '', 'bundle', ?, ?, ?)")
    .run(user.id, gateway.id, Math.round(bundle.price * 100), currency, `${bundle.minutes} call minutes`, bundle.minutes, bundle.name, new Date().toISOString());
  audit(user.email, "billing.bundle", bundle.name);
  const { beginCheckout, requestOrigin } = await import("@/lib/payments");
  const started = await beginCheckout(Number(info.lastInsertRowid), await requestOrigin());
  if (!started.ok) redirect(`/pay/${info.lastInsertRowid}?error=${encodeURIComponent(started.message)}`);
  redirect(started.url);
}

export async function refreshMinutes() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { syncUserMinutes } = await import("@/lib/minutes");
  const result = await syncUserMinutes(user.id);
  audit(user.email, "minutes.sync", result.ok ? "ok" : "failed");
  if (!result.ok) redirect(`/account/minutes?error=${encodeURIComponent(result.message)}`);
  redirect("/account/minutes?saved=1");
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

export async function addPerson(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { appPassword, extensionCapacity, extensionRange, nextExtension, paidPlan, provisionExtension } = await import("@/lib/pbx");
  const plan = paidPlan(user.id);
  if (!plan) redirect("/account/phone?error=Pay%20for%20a%20plan%20before%20adding%20people.");
  const first = String(formData.get("first_name") || "").trim().slice(0, 40);
  const last = String(formData.get("last_name") || "").trim().slice(0, 40);
  const email = String(formData.get("email") || "").trim().slice(0, 120);
  if (!first || !last || !email.includes("@")) redirect("/account/phone?error=First%20name%2C%20last%20name%2C%20and%20email%20are%20required.");
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ?").get(user.id) as { n: number };
  if (count.n >= extensionCapacity(plan)) redirect("/account/phone?error=This%20plan%20has%20no%20room%20for%20another%20person.");
  const range = extensionRange(user.id);
  const used = getDb().prepare("SELECT number FROM pbx_extensions WHERE user_id = ?").all(user.id) as { number: string }[];
  const number = nextExtension(range.from, range.to, used.map((row) => row.number));
  if (!number) redirect("/account/phone?error=This%20plan%20has%20no%20room%20for%20another%20person.");
  const info = getDb()
    .prepare("INSERT INTO pbx_extensions (user_id, number, first_name, last_name, email, status, access_password, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)")
    .run(user.id, number, first, last, email, appPassword(), new Date().toISOString());
  audit(user.email, "pbx.person", number);
  if (flagOn("pbx.live_provision")) {
    const result = await provisionExtension(Number(info.lastInsertRowid));
    if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(result.message)}`);
  }
  redirect("/account/phone?saved=1");
}

export async function savePhoneHours(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const open = String(formData.get("open_time") || "09:00").slice(0, 5);
  const close = String(formData.get("close_time") || "17:00").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) redirect("/account/phone?error=Use%20hours%20like%2009%3A00.");
  getDb().prepare(
    `INSERT INTO pbx_departments (user_id, name, xapi_id, number_from, number_to, open_time, close_time, last_message)
     VALUES (?, ?, 0, '', '', ?, ?, '')
     ON CONFLICT(user_id) DO UPDATE SET open_time = excluded.open_time, close_time = excluded.close_time`,
  ).run(user.id, `SautiCall ${user.id}`, open, close);
  const { updateRouting } = await import("@/lib/pbx");
  const result = await updateRouting(user.id);
  audit(user.email, "pbx.hours", `${open}-${close}`);
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(result.message)}`);
  redirect("/account/phone?saved=1");
}
