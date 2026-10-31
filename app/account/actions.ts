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
import { safeCustomerError } from "@/lib/customer-message";
import { finishAfterResponse } from "@/lib/later";
import { audit, flagOn, getDb } from "@/lib/db";
import { accountNeedsMfa, revealBlock } from "@/lib/mfa";

type FormState = { error: string } | null;

type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: "super_admin" | "staff" | "customer";
  mfa_secret: string | null;
  mfa_required?: number;
  disabled?: number;
};

export async function login(_previous: FormState, formData: FormData) {
  if (!flagOn("auth.password_login")) return { error: "Password sign-in is turned off by an administrator." };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!user || !(await verifyPassword(password, user.password_hash))) return { error: "Email or password is incorrect." };
  if (user.disabled) return { error: "This account is turned off. An administrator can turn it back on." };
  const needsMfa = accountNeedsMfa(user);
  const needsCode = needsMfa && Boolean(user.mfa_secret);
  await createSession(user.id, needsCode);
  if (user.role === "customer") {
    const id = user.id;
    finishAfterResponse(() => import("@/lib/voip-client").then(({ provisionCustomer }) => provisionCustomer(id)));
  }
  audit(user.email, "auth.login", needsCode ? "mfa-pending" : "password");
  if (needsCode) redirect("/account/login?step=code");
  if (needsMfa && !user.mfa_secret) redirect("/account/security");
  redirect(user.role === "customer" ? "/account" : "/admin");
}

export async function confirmMfa(_previous: FormState, formData: FormData) {
  const user = await currentUser();
  if (!user?.mfa_secret) return { error: "Sign in again to continue." };
  const code = String(formData.get("code") || "");
  if (!totpMatches(user.mfa_secret, code)) return { error: "That code is not valid." };
  await markMfaComplete();
  audit(user.email, "auth.mfa", "ok");
  redirect(user.role === "customer" ? "/account" : "/admin");
}

export async function register(_previous: FormState, formData: FormData) {
  if (!flagOn("auth.signup")) return { error: "New registrations are turned off by an administrator." };
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const { normalizeMobile } = await import("@/lib/verify-code");
  const phone = normalizeMobile(String(formData.get("phone") || ""));
  if (!name || !email || password.length < 8) return { error: "Use your name, email, and a password of at least 8 characters." };
  if (!phone) return { error: "Enter a mobile number with the country code, such as +1 202 555 0100." };
  if (formData.get("terms") !== "on") return { error: "Agree to the Terms of Service to create an account." };
  const now = new Date().toISOString();
  try {
    getDb()
      .prepare("INSERT INTO users (email, name, password_hash, role, mfa_secret, created_at, phone, terms_accepted_at) VALUES (?, ?, ?, 'customer', NULL, ?, ?, ?)")
      .run(email, name, hashPassword(password), now, phone, now);
  } catch {
    return { error: "An account with that email already exists." };
  }
  const user = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number };
  const planName = String(formData.get("plan") || "").trim().slice(0, 80);
  const setup = String(formData.get("setup") || "").trim().slice(0, 400);
  if (planName || setup) {
    getDb()
      .prepare("INSERT INTO account_requests (user_id, kind, payload, status, created_at) VALUES (?, 'setup', ?, 'requested', ?)")
      .run(user.id, JSON.stringify({ plan: planName, prompt: setup }), now);
  }
  await createSession(user.id, false);
  const id = user.id;
  const { ensureCustomerCode } = await import("@/lib/customer-code-store");
  ensureCustomerCode(id, planName);
  finishAfterResponse(() => import("@/lib/voip-client").then(({ ensureVoipClient }) => ensureVoipClient(id)));
  const emailOn = flagOn("auth.verify_email");
  const smsOn = flagOn("auth.verify_sms");
  const query = new URLSearchParams();
  if (emailOn) {
    const { requestOrigin } = await import("@/lib/payments");
    const { sendAccountEmail } = await import("@/lib/account-verify");
    const emailResult = await sendAccountEmail(user.id, await requestOrigin()).catch(() => ({ ok: false as const, message: "The confirmation email could not be sent. Try again shortly." }));
    query.set("email", emailResult.ok ? "sent" : "waiting");
    if (!emailResult.ok && emailResult.message) query.set("error", emailResult.message);
  }
  if (smsOn) {
    const { sendAccountSms } = await import("@/lib/account-verify");
    const smsResult = await sendAccountSms(user.id).catch(() => ({ ok: false as const, message: "The text message could not be sent. Try again in a minute." }));
    query.set("sms", smsResult.ok ? "sent" : "waiting");
    if (!query.get("error") && !smsResult.ok && smsResult.message) query.set("error", smsResult.message);
  }
  audit(email, "auth.register", planName || "customer");
  if (planName) query.set("plan", planName);
  redirect(`/account/verify?${query}`);
}

export async function confirmEmailCode(_previous: FormState, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("auth.verify_email")) redirect("/account/verify");
  const { confirmEmailCode: confirm } = await import("@/lib/account-verify");
  const result = confirm(user.id, String(formData.get("code") || ""));
  if (!result.ok) redirect(`/account/verify?error=${encodeURIComponent(result.message)}`);
  redirect("/account/verify?email=ok");
}

export async function confirmPhoneCode(_previous: FormState, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("auth.verify_sms")) redirect("/account/verify");
  const { confirmSmsCode } = await import("@/lib/account-verify");
  const result = confirmSmsCode(user.id, String(formData.get("code") || ""));
  if (!result.ok) redirect(`/account/verify?error=${encodeURIComponent(result.message)}`);
  const id = user.id;
  finishAfterResponse(() => import("@/lib/voip-client").then(({ ensureVoipClient }) => ensureVoipClient(id, true)));
  redirect("/account/verify?phone=ok");
}

export async function resendEmailVerification() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("auth.verify_email")) redirect("/account/verify");
  const { requestOrigin } = await import("@/lib/payments");
  const { sendAccountEmail } = await import("@/lib/account-verify");
  const result = await sendAccountEmail(user.id, await requestOrigin());
  if (!result.ok) redirect(`/account/verify?error=${encodeURIComponent(result.message)}`);
  redirect("/account/verify?email=sent");
}

export async function saveMobile(_previous: FormState, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { normalizeMobile } = await import("@/lib/verify-code");
  const phone = normalizeMobile(String(formData.get("phone") || ""));
  if (!phone) redirect("/account/verify?error=Enter%20a%20mobile%20number%20with%20the%20country%20code.");
  getDb().prepare("UPDATE users SET phone = ?, phone_verified_at = '' WHERE id = ?").run(phone, user.id);
  if (!flagOn("auth.verify_sms")) redirect("/account/verify?phone=saved");
  const { sendAccountSms } = await import("@/lib/account-verify");
  const result = await sendAccountSms(user.id).catch(() => ({ ok: false as const, message: "The text message could not be sent. Try again in a minute." }));
  if (result.ok) redirect("/account/verify?sms=sent");
  const error = "message" in result && result.message ? `&error=${encodeURIComponent(result.message)}` : "";
  redirect(`/account/verify?sms=waiting${error}`);
}

export async function resendPhoneVerification() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("auth.verify_sms")) redirect("/account/verify");
  const { sendAccountSms } = await import("@/lib/account-verify");
  const result = await sendAccountSms(user.id);
  if (!result.ok) redirect(`/account/verify?sms=waiting&error=${encodeURIComponent(result.message)}`);
  redirect("/account/verify?sms=sent");
}

export async function logout() {
  const user = await currentUser();
  await destroySession();
  if (user) audit(user.email, "auth.logout", "");
  redirect("/");
}

export async function enrollMfa(_previous: FormState, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const secret = String(formData.get("secret") || "");
  const code = String(formData.get("code") || "");
  if (!totpMatches(secret, code)) return { error: "That code does not match this authenticator setup." };
  getDb().prepare("UPDATE users SET mfa_secret = ? WHERE id = ?").run(secret, user.id);
  await markMfaComplete();
  audit(user.email, "auth.mfa.enroll", "");
  redirect("/account/security?tab=security");
}

export async function clearOwnMfa() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (accountNeedsMfa(user)) redirect("/account/security");
  getDb().prepare("UPDATE users SET mfa_secret = NULL WHERE id = ?").run(user.id);
  audit(user.email, "auth.mfa.clear", "");
  redirect("/account/security?tab=security");
}

export async function saveDisplayName(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "customer") redirect("/account/login");
  const name = String(formData.get("name") || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) redirect("/account/security?tab=profile&error=Enter%20the%20name%20for%20this%20account.");
  getDb().prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
  audit(user.email, "account.name", name);
  redirect("/account/security?tab=profile&saved=name");
}

export async function revealAppPassword(extensionId: number, code: string): Promise<{ error?: string; password?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Sign in again to continue." };
  const blocked = revealBlock(user, code);
  if (blocked) return { error: blocked };
  const row = getDb()
    .prepare("SELECT access_password FROM pbx_extensions WHERE id = ? AND user_id = ? AND status = 'created'")
    .get(extensionId, user.id) as { access_password: string } | undefined;
  if (!row?.access_password) return { error: "That app password is not available." };
  audit(user.email, "pbx.password.reveal", String(extensionId));
  return { password: row.access_password };
}

export async function startCheckout(_previous: FormState, formData: FormData) {
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
  if (!readGatewaySecret(gateway.secret).key) return { error: "That way to pay is not ready yet." };
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
  if (!started.ok) redirect(`/pay/${attemptId}?error=${encodeURIComponent(safeCustomerError(started.message, "Payment could not be started. Please try again, or contact support."))}`);
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
  if (!readGatewaySecret(gateway.secret).key) redirect("/account/minutes?error=That%20way%20to%20pay%20is%20not%20ready%20yet.");
  const currency = (gateway.currencies || "USD").split(",")[0].trim().toUpperCase() || "USD";
  const info = getDb()
    .prepare("INSERT INTO payment_attempts (user_id, gateway_id, amount_cents, currency, description, status, plan_name, product_kind, product_minutes, bundle_name, created_at) VALUES (?, ?, ?, ?, ?, 'pending', '', 'bundle', ?, ?, ?)")
    .run(user.id, gateway.id, Math.round(bundle.price * 100), currency, `${bundle.minutes} call minutes`, bundle.minutes, bundle.name, new Date().toISOString());
  audit(user.email, "billing.bundle", bundle.name);
  const { beginCheckout, requestOrigin } = await import("@/lib/payments");
  const started = await beginCheckout(Number(info.lastInsertRowid), await requestOrigin());
  if (!started.ok) redirect(`/pay/${info.lastInsertRowid}?error=${encodeURIComponent(safeCustomerError(started.message, "Payment could not be started. Please try again, or contact support."))}`);
  redirect(started.url);
}

export async function refreshMinutes() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { syncUserMinutes } = await import("@/lib/minutes");
  const { finishAfterResponse } = await import("@/lib/later");
  finishAfterResponse(() => syncUserMinutes(user.id));
  audit(user.email, "minutes.sync", "started");
  redirect("/account/minutes?saved=sync");
}

export async function saveNumber(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("numbers.search")) redirect("/account/numbers?error=An%20administrator%20has%20turned%20this%20request%20off.");
  const { paidPlan } = await import("@/lib/pbx");
  const { planAllows } = await import("@/lib/plan-features");
  if (!planAllows(paidPlan(user.id), "numbers")) redirect("/account/numbers?error=Business%20numbers%20are%20not%20included%20on%20your%20plan.");
  const verified = getDb().prepare("SELECT phone_verified_at FROM users WHERE id = ?").get(user.id) as { phone_verified_at: string } | undefined;
  if (flagOn("auth.verify_sms") && !verified?.phone_verified_at) redirect("/account/numbers?error=Confirm%20your%20mobile%20number%20before%20buying%20a%20number.");
  const { getEmergency } = await import("@/lib/e911");
  const emergency = getEmergency(user.id);
  if (!emergency) redirect("/account/numbers?error=Add%20your%20address%20before%20buying%20a%20number.");
  if (!flagOn("numbers.live_search")) redirect("/account/numbers?error=Number%20inventory%20search%20is%20turned%20off.");
  const { normalizeRequestedDid } = await import("@/lib/did-list");
  if (formData.get("number_terms") !== "on") redirect("/account/numbers?error=Agree%20to%20the%20Terms%20of%20Service%20before%20buying%20a%20number.");
  const did = normalizeRequestedDid(String(formData.get("did") || ""));
  if (!did) redirect("/account/numbers?error=Choose%20a%2010-digit%20number%20from%20the%20inventory%20search.");
  const country = String(formData.get("country") || "US").slice(0, 2).toUpperCase() === "CA" ? "CA" : "US";
  const region = String(formData.get("region") || "").trim().toUpperCase();
  const ratecenter = String(formData.get("ratecenter") || "").trim();
  const { regionAllowed } = await import("@/lib/places");
  if (!/^[A-Z]{2}$/.test(region) || !regionAllowed(country, region)) redirect("/account/numbers?error=Choose%20a%20state%20or%20province%20from%20the%20list.");
  if (!ratecenter) redirect("/account/numbers?error=Choose%20a%20city%20from%20the%20list.");
  const monthly = String(formData.get("monthly") || "").replace(/[^0-9.]/g, "").slice(0, 12);
  const payload = { did, country, region, ratecenter: ratecenter.toUpperCase(), monthly, emergency, termsAcceptedAt: new Date().toISOString() };
  const info = getDb()
    .prepare("INSERT INTO account_requests (user_id, kind, payload, status, created_at) VALUES (?, 'number', ?, 'requested', ?)")
    .run(user.id, JSON.stringify(payload), new Date().toISOString());
  const requestId = Number(info.lastInsertRowid);
  audit(user.email, "request.number", payload.did);
  const { numberPurchaseMode } = await import("@/lib/number-order");
  const mode = numberPurchaseMode(flagOn("numbers.live_order"), flagOn("numbers.auto_order"));
  if (mode === "off" && flagOn("numbers.auto_order")) redirect("/account/numbers?saved=held");
  if (mode !== "automatic") redirect("/account/numbers?saved=1");
  getDb().prepare("UPDATE account_requests SET status = ?, staff_note = ? WHERE id = ?").run("ordering", "Buying this number on the phone-company account.", requestId);
  const { finishAfterResponse } = await import("@/lib/later");
  const buyerId = user.id;
  finishAfterResponse(async () => {
    const { purchaseNumber } = await import("@/lib/lines");
    const { orderRecord } = await import("@/lib/number-order");
    const result = await purchaseNumber({ requestId, userId: buyerId, did, monthly });
    const recorded = orderRecord(result, did);
    getDb().prepare("UPDATE account_requests SET status = ?, staff_note = ?, provider_ref = ? WHERE id = ?").run(recorded.status, result.detail || result.message, recorded.providerRef, requestId);
    audit(user.email, "request.order", `${requestId}:${recorded.status}`);
  });
  redirect("/account/numbers?saved=ordering");
}

export async function saveEmergencyAddress(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { parseEmergency, saveEmergency, syncEmergency } = await import("@/lib/e911");
  const parsed = parseEmergency({
    full_name: String(formData.get("full_name") || ""),
    street_number: String(formData.get("street_number") || ""),
    street_name: String(formData.get("street_name") || ""),
    address_type: String(formData.get("address_type") || ""),
    address_number: String(formData.get("address_number") || ""),
    city: String(formData.get("city") || ""),
    state: String(formData.get("state") || ""),
    country: String(formData.get("country") || ""),
    zip: String(formData.get("zip") || ""),
    language: String(formData.get("language") || ""),
  });
  const next = String(formData.get("next") || "");
  const back = next === "verify" ? "/account/verify" : next === "profile" ? "/account/security?tab=profile" : "/account/numbers";
  if (!parsed.ok) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(parsed.message)}`);
  saveEmergency(user.id, parsed.address);
  const userId = user.id;
  const { finishAfterResponse } = await import("@/lib/later");
  finishAfterResponse(async () => {
    const { ensureVoipClient } = await import("@/lib/voip-client");
    await ensureVoipClient(userId, true);
    const sent = await syncEmergency(userId);
    audit(user.email, "e911.save", sent.ok ? "ok" : "needs-person");
  });
  audit(user.email, "e911.save", "saved");
  redirect(next === "verify" ? "/account/verify?address=ok" : next === "profile" ? "/account/security?tab=profile&saved=address" : "/account/numbers?address=1");
}

export async function savePort(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("porting.requests")) redirect("/account/porting?error=An%20administrator%20has%20turned%20this%20request%20off.");
  const { paidPlan: subscribed } = await import("@/lib/pbx");
  const { planAllows: allows } = await import("@/lib/plan-features");
  if (!allows(subscribed(user.id), "porting")) redirect("/account/porting?error=Number%20transfer%20is%20not%20included%20on%20your%20plan.");
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
  const { regionAllowed } = await import("@/lib/places");
  if (!regionAllowed(payload.country, payload.state)) redirect("/account/porting?error=Choose%20a%20state%20or%20province%20from%20the%20list.");
  if (!payload.numbers || !payload.first_name || !payload.last_name || !payload.address1 || !payload.city || !payload.state || !payload.zip_code || !payload.provider_name || !payload.provider_account) {
    redirect("/account/porting?error=Number%2C%20name%2C%20service%20address%2C%20current%20carrier%2C%20and%20carrier%20account%20are%20required.");
  }
  const live = flagOn("porting.live_submit");
  const info = getDb()
    .prepare("INSERT INTO account_requests (user_id, kind, payload, status, provider_ref, staff_note, created_at) VALUES (?, 'port', ?, ?, '', '', ?)")
    .run(user.id, JSON.stringify(payload), live ? "ordering" : "requested", new Date().toISOString());
  const requestId = Number(info.lastInsertRowid);
  audit(user.email, "request.port", live ? "ordering" : "requested");
  if (live) {
    const userId = user.id;
    finishAfterResponse(async () => {
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
        const port = result.body && typeof result.body === "object" ? (result.body as { port?: unknown }).port : "";
        getDb().prepare("UPDATE account_requests SET status = 'submitted', provider_ref = ? WHERE id = ?").run(String(port || ""), requestId);
      } else {
        const { recordFailure } = await import("@/lib/failure-log");
        recordFailure({ area: "transfer", userId, subject: payload.numbers, detail: result.message });
        getDb().prepare("UPDATE account_requests SET status = 'exception', staff_note = ? WHERE id = ?").run(result.message, requestId);
      }
    });
  }
  redirect("/account/porting?saved=1");
}

export async function addPerson(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { allocateExtension, appPassword, extensionCapacity, paidPlan, provisionExtension } = await import("@/lib/pbx");
  const plan = paidPlan(user.id);
  if (!plan) redirect("/account/phone?error=Pay%20for%20a%20plan%20before%20adding%20people.");
  const first = String(formData.get("first_name") || "").trim().slice(0, 40);
  const last = String(formData.get("last_name") || "").trim().slice(0, 40);
  const email = String(formData.get("email") || "").trim().slice(0, 120);
  if (!first || !last || !email.includes("@")) redirect("/account/phone?error=First%20name%2C%20last%20name%2C%20and%20email%20are%20required.");
  const taken = getDb().prepare("SELECT id FROM pbx_extensions WHERE lower(email) = lower(?) AND status != 'removed'").get(email) as { id: number } | undefined;
  if (taken) redirect("/account/phone?error=That%20email%20is%20already%20used%20for%20an%20extension.%20Use%20a%20different%20email.");
  const { systemsForPlan, validateAiExtension } = await import("@/lib/ai-account");
  const aiChoice = validateAiExtension({
    role: String(formData.get("ai_role") || ""),
    name: String(formData.get("ai_name") || ""),
    allowed: systemsForPlan(plan.features).filter((item) => item.included).map((item) => item.code),
  });
  if (!aiChoice.ok) redirect(`/account/phone?error=${encodeURIComponent(aiChoice.message)}`);
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM pbx_extensions WHERE user_id = ? AND status != 'removed'").get(user.id) as { n: number };
  if (count.n >= extensionCapacity(plan)) redirect("/account/phone?error=This%20plan%20has%20no%20room%20for%20another%20person.");
  const { departmentNameIssue: nameIssue } = await import("@/lib/pbx-user");
  const department = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(user.id) as { name: string } | undefined;
  const nameProblem = nameIssue(department?.name || "");
  if (nameProblem) redirect(`/account/phone?error=${encodeURIComponent(nameProblem)}`);
  const used = [
    ...(getDb().prepare("SELECT number FROM pbx_extensions WHERE status != 'removed'").all() as { number: string }[]),
    ...(getDb().prepare("SELECT number FROM call_groups").all() as { number: string }[]),
  ].map((row) => row.number);
  const { persistNewExtensionRanges, planExtensionRanges } = await import("@/lib/extension-plan");
  const reserved = planExtensionRanges();
  persistNewExtensionRanges(reserved.ranges);
  const allocated = await allocateExtension(user.id, used, reserved.plan, reserved.ranges);
  if (!allocated.ok) {
    audit(user.email, "pbx.extension.allocate", allocated.message.slice(0, 400));
    const { extensionCustomerMessage } = await import("@/lib/customer-message");
    const setupMessage = /not enabled|missing credentials|not configured/i.test(allocated.message)
      ? "People cannot be added until an administrator turns on the phone system."
      : extensionCustomerMessage(allocated.message);
    redirect(`/account/phone?error=${encodeURIComponent(setupMessage)}`);
  }
  const number = allocated.number;
  const info = getDb()
    .prepare("INSERT INTO pbx_extensions (user_id, number, first_name, last_name, email, status, access_password, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)")
    .run(user.id, number, first, last, email, appPassword(), new Date().toISOString());
  audit(user.email, "pbx.person", number);
  if (aiChoice.role) {
    const { assignExtensionAi } = await import("@/lib/ai-account-store");
    assignExtensionAi(user.id, plan, Number(info.lastInsertRowid), aiChoice.role, aiChoice.name);
  }
  if (flagOn("pbx.live_provision")) {
    const extensionId = Number(info.lastInsertRowid);
    const result = await provisionExtension(extensionId);
    if (!result.ok) {
      const raw = "detail" in result && result.detail ? String(result.detail) : result.message;
      const { extensionCustomerMessage, extensionEmailConflict } = await import("@/lib/customer-message");
      if (extensionEmailConflict(raw)) getDb().prepare("DELETE FROM pbx_extensions WHERE id = ? AND xapi_id = 0").run(extensionId);
      redirect(`/account/phone?error=${encodeURIComponent(extensionCustomerMessage(raw))}`);
    }
  }
  redirect("/account/phone?saved=1");
}

export async function savePerson(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { paidPlan, updateExtensionProfile } = await import("@/lib/pbx");
  const plan = paidPlan(user.id);
  const result = await updateExtensionProfile(Number(formData.get("id")), user.id, {
    first: String(formData.get("first_name") || ""),
    last: String(formData.get("last_name") || ""),
    email: String(formData.get("email") || ""),
  });
  audit(user.email, "pbx.person.edit", result.ok ? "saved" : result.message.slice(0, 400));
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "This person could not be updated. Please try again, or contact support."))}`);
  const { systemsForPlan, validateAiExtension } = await import("@/lib/ai-account");
  const aiChoice = validateAiExtension({
    role: String(formData.get("ai_role") || ""),
    name: String(formData.get("ai_name") || ""),
    allowed: systemsForPlan(plan?.features || []).filter((item) => item.included).map((item) => item.code),
  });
  if (!aiChoice.ok) redirect(`/account/phone?error=${encodeURIComponent(aiChoice.message)}`);
  const { assignExtensionAi } = await import("@/lib/ai-account-store");
  const assigned = assignExtensionAi(user.id, plan, Number(formData.get("id")), aiChoice.role, aiChoice.name);
  if (!assigned.ok) redirect(`/account/phone?error=${encodeURIComponent(assigned.message)}`);
  redirect("/account/phone?saved=person");
}

export async function removePerson(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const id = Number(formData.get("id"));
  const owned = getDb().prepare("SELECT id, number, first_name, last_name, email FROM pbx_extensions WHERE id = ? AND user_id = ?").get(id, user.id) as { id: number; number: string; first_name: string; last_name: string; email: string } | undefined;
  if (!owned) redirect("/account/phone?error=That%20person%20was%20not%20found.");
  const { removeExtension } = await import("@/lib/pbx");
  const result = await removeExtension(id);
  audit(user.email, "pbx.person.remove", result.ok ? `${owned.number} ${owned.first_name} ${owned.last_name} ${owned.email}` : `${id}:failed`);
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "We could not remove this person yet. Please try again, or contact support."))}`);
  redirect("/account/phone?saved=removed");
}

export async function saveDepartmentName(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const { paidPlan: departmentPlan } = await import("@/lib/pbx");
  if (!departmentPlan(user.id)) redirect("/account/phone?error=Pay%20for%20a%20plan%20before%20adding%20people.");
  const { applyDepartmentName } = await import("@/lib/pbx");
  const result = await applyDepartmentName(user.id, String(formData.get("company_name") || ""));
  audit(user.email, "pbx.department", result.ok ? "saved" : (result.detail || result.message).slice(0, 400));
  const settings = String(formData.get("next") || "") === "settings";
  const back = settings ? "/account/security" : "/account/phone";
  const tab = settings ? "&tab=business" : "";
  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(safeCustomerError(result.message, "The company name could not be saved. Check the name rules and try again."))}${tab}`);
  redirect(`${back}?saved=department${tab}`);
}

export async function savePhoneHours(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  const open = String(formData.get("open_time") || "09:00").slice(0, 5);
  const close = String(formData.get("close_time") || "17:00").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) redirect("/account/phone?error=Use%20hours%20like%2009%3A00.");
  const { paidPlan: hoursPlan } = await import("@/lib/pbx");
  const { planAllows: hoursAllowed } = await import("@/lib/plan-features");
  if (!hoursAllowed(hoursPlan(user.id), "business_hours")) redirect("/account/phone?error=Business%20hours%20are%20not%20included%20on%20your%20plan.");
  getDb().prepare(
    `INSERT INTO pbx_departments (user_id, name, xapi_id, number_from, number_to, open_time, close_time, last_message)
     VALUES (?, ?, 0, '', '', ?, ?, '')
     ON CONFLICT(user_id) DO UPDATE SET open_time = excluded.open_time, close_time = excluded.close_time`,
  ).run(user.id, "", open, close);
  const { updateRouting } = await import("@/lib/pbx");
  const { finishAfterResponse } = await import("@/lib/later");
  const userId = user.id;
  finishAfterResponse(() => updateRouting(userId));
  audit(user.email, "pbx.hours", `${open}-${close}`);
  redirect("/account/phone?saved=hours");
}

export async function saveOwnLineVariables(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "customer") redirect("/account/login");
  const { listLineVariables, saveCustomerLineValues } = await import("@/lib/line-variable-store");
  const { customerCanEdit } = await import("@/lib/line-variables");
  const entries = listLineVariables()
    .filter((item) => customerCanEdit(item))
    .map((item) => ({ key: item.key, value: String(formData.get(`value_${item.key}`) || "") }));
  saveCustomerLineValues(user.id, entries);
  audit(user.email, "line.variables", "customer");
  redirect("/account/billing?saved=variables");
}
