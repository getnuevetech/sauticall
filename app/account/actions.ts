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
import { audit, flagOn, getDb } from "@/lib/db";
import { accountNeedsMfa, revealBlock } from "@/lib/mfa";

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

export async function login(formData: FormData) {
  if (!flagOn("auth.password_login")) return { error: "Password sign-in is turned off by an administrator." };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return { error: "Email or password is incorrect." };
  if (user.disabled) return { error: "This account is turned off. An administrator can turn it back on." };
  const needsMfa = accountNeedsMfa(user);
  const needsCode = needsMfa && Boolean(user.mfa_secret);
  await createSession(user.id, needsCode);
  if (user.role === "customer") {
    const { provisionCustomer } = await import("@/lib/voip-client");
    await provisionCustomer(user.id).catch(() => undefined);
  }
  audit(user.email, "auth.login", needsCode ? "mfa-pending" : "password");
  if (needsCode) redirect("/account/login?step=code");
  if (needsMfa && !user.mfa_secret) redirect("/account/security");
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
  const planName = String(formData.get("plan") || "").trim().slice(0, 80);
  const setup = String(formData.get("setup") || "").trim().slice(0, 400);
  if (planName || setup) {
    getDb()
      .prepare("INSERT INTO account_requests (user_id, kind, payload, status, created_at) VALUES (?, 'setup', ?, 'requested', ?)")
      .run(user.id, JSON.stringify({ plan: planName, prompt: setup }), new Date().toISOString());
  }
  await createSession(user.id, false);
  const { provisionCustomer } = await import("@/lib/voip-client");
  await provisionCustomer(user.id).catch(() => undefined);
  audit(email, "auth.register", planName || "customer");
  redirect(planName ? `/account/billing?plan=${encodeURIComponent(planName)}` : "/account/billing");
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
  const secret = String(formData.get("secret") || "");
  const code = String(formData.get("code") || "");
  if (!totpMatches(secret, code)) return { error: "That code does not match this authenticator setup." };
  getDb().prepare("UPDATE users SET mfa_secret = ? WHERE id = ?").run(secret, user.id);
  await markMfaComplete();
  audit(user.email, "auth.mfa.enroll", "");
  redirect("/account/security");
}

export async function clearOwnMfa() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (accountNeedsMfa(user)) redirect("/account/security");
  getDb().prepare("UPDATE users SET mfa_secret = NULL WHERE id = ?").run(user.id);
  audit(user.email, "auth.mfa.clear", "");
  redirect("/account/security");
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
  const result = await syncUserMinutes(user.id);
  audit(user.email, "minutes.sync", result.ok ? "ok" : "failed");
  if (!result.ok) redirect(`/account/minutes?error=${encodeURIComponent(safeCustomerError(result.message, "Call minutes could not be updated. Please try again, or contact support."))}`);
  redirect("/account/minutes?saved=1");
}

export async function saveNumber(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (!flagOn("numbers.search")) redirect("/account/numbers?error=An%20administrator%20has%20turned%20this%20request%20off.");
  const { paidPlan } = await import("@/lib/pbx");
  const { planAllows } = await import("@/lib/plan-features");
  if (!planAllows(paidPlan(user.id), "numbers")) redirect("/account/numbers?error=Business%20numbers%20are%20not%20included%20on%20your%20plan.");
  const { getEmergency } = await import("@/lib/e911");
  const emergency = getEmergency(user.id);
  if (!emergency) redirect("/account/numbers?error=Add%20the%20emergency%20address%20first.");
  if (!flagOn("numbers.live_search")) redirect("/account/numbers?error=Number%20inventory%20search%20is%20turned%20off.");
  const { normalizeRequestedDid } = await import("@/lib/did-list");
  const did = normalizeRequestedDid(String(formData.get("did") || ""));
  if (!did) redirect("/account/numbers?error=Choose%20a%2010-digit%20number%20from%20the%20inventory%20search.");
  const country = String(formData.get("country") || "US").slice(0, 2).toUpperCase() === "CA" ? "CA" : "US";
  const region = String(formData.get("region") || "").trim().toUpperCase();
  const ratecenter = String(formData.get("ratecenter") || "").trim();
  const { regionAllowed } = await import("@/lib/places");
  if (!/^[A-Z]{2}$/.test(region) || !regionAllowed(country, region)) redirect("/account/numbers?error=Choose%20a%20state%20or%20province%20from%20the%20list.");
  const { findInventoryDid, listedCity } = await import("@/lib/carriers");
  const city = await listedCity(country, region, ratecenter);
  if (!city.ok) redirect(`/account/numbers?error=${encodeURIComponent(safeCustomerError(city.message, "The city list is not available right now. Try again shortly."))}`);
  const match = await findInventoryDid(country, region, city.city, did);
  if (!match) redirect("/account/numbers?error=That%20number%20is%20not%20in%20the%20current%20inventory.%20Search%20again%20and%20choose%20a%20listed%20number.");
  const payload = { did: match.did, country, region: (match.state || region).toUpperCase(), ratecenter: (match.ratecenter || city.city).toUpperCase(), emergency };
  const info = getDb()
    .prepare("INSERT INTO account_requests (user_id, kind, payload, status, created_at) VALUES (?, 'number', ?, 'requested', ?)")
    .run(user.id, JSON.stringify(payload), new Date().toISOString());
  const requestId = Number(info.lastInsertRowid);
  audit(user.email, "request.number", payload.did);
  const { numberPurchaseMode } = await import("@/lib/number-order");
  const mode = numberPurchaseMode(flagOn("numbers.live_order"), flagOn("numbers.auto_order"));
  if (mode === "off" && flagOn("numbers.auto_order")) redirect("/account/numbers?saved=held");
  if (mode !== "automatic") redirect("/account/numbers?saved=1");
  const { purchaseNumber } = await import("@/lib/lines");
  const result = await purchaseNumber({ requestId, userId: user.id, did: payload.did });
  const { carrierDidRef } = await import("@/lib/number-order");
  const status = result.ok || result.pending ? "ordered" : "exception";
  const ref = result.ok ? carrierDidRef(payload.did) : "";
  getDb().prepare("UPDATE account_requests SET status = ?, staff_note = ?, provider_ref = ? WHERE id = ?").run(status, result.message, ref, requestId);
  audit(user.email, "request.order", `${requestId}:${status}`);
  if (result.pending) redirect("/account/numbers?saved=pending");
  if (!result.ok) redirect(`/account/numbers?error=${encodeURIComponent(safeCustomerError(result.message, "We could not buy that number. Please try again, or contact support."))}`);
  redirect("/account/numbers?saved=ordered");
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
  if (!parsed.ok) redirect(`/account/numbers?error=${encodeURIComponent(parsed.message)}`);
  const { listedCity } = await import("@/lib/carriers");
  const city = await listedCity(parsed.address.country, parsed.address.state, parsed.address.city);
  if (!city.ok) redirect(`/account/numbers?error=${encodeURIComponent(safeCustomerError(city.message, "The city list is not available right now. Try again shortly."))}`);
  parsed.address.city = city.city;
  saveEmergency(user.id, parsed.address);
  const { ensureVoipClient } = await import("@/lib/voip-client");
  await ensureVoipClient(user.id, true);
  const result = await syncEmergency(user.id);
  audit(user.email, "e911.save", result.ok ? "ok" : "needs-person");
  if (!result.ok) redirect(`/account/numbers?error=${encodeURIComponent(safeCustomerError(result.message, "The emergency address was saved. The team will finish sending it."))}`);
  redirect("/account/numbers?address=1");
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
  const { listedCity } = await import("@/lib/carriers");
  const chosen = await listedCity(payload.country, payload.state, payload.city);
  if (!chosen.ok) redirect(`/account/porting?error=${encodeURIComponent(chosen.message)}`);
  payload.city = chosen.city;
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
      console.error(`[sauticall] ${result.message}`);
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
  const { allocateExtension, appPassword, extensionCapacity, listPhoneSystemNumbers, paidPlan, provisionExtension } = await import("@/lib/pbx");
  const plan = paidPlan(user.id);
  if (!plan) redirect("/account/phone?error=Pay%20for%20a%20plan%20before%20adding%20people.");
  const first = String(formData.get("first_name") || "").trim().slice(0, 40);
  const last = String(formData.get("last_name") || "").trim().slice(0, 40);
  const email = String(formData.get("email") || "").trim().slice(0, 120);
  if (!first || !last || !email.includes("@")) redirect("/account/phone?error=First%20name%2C%20last%20name%2C%20and%20email%20are%20required.");
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
  if (flagOn("pbx.live_provision")) {
    const listed = await listPhoneSystemNumbers();
    if (listed.ok) used.push(...listed.numbers);
    else audit(user.email, "pbx.extension.list", listed.message.slice(0, 400));
  }
  const { persistNewExtensionRanges, planExtensionRanges } = await import("@/lib/extension-plan");
  const reserved = planExtensionRanges();
  persistNewExtensionRanges(reserved.ranges);
  const allocated = await allocateExtension(user.id, used, reserved.plan, reserved.ranges);
  if (!allocated.ok) {
    audit(user.email, "pbx.extension.allocate", allocated.message.slice(0, 400));
    redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(allocated.message, "We could not add this person yet. Please try again, or contact support."))}`);
  }
  const number = allocated.number;
  const info = getDb()
    .prepare("INSERT INTO pbx_extensions (user_id, number, first_name, last_name, email, status, access_password, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)")
    .run(user.id, number, first, last, email, appPassword(), new Date().toISOString());
  audit(user.email, "pbx.person", number);
  if (flagOn("pbx.live_provision")) {
    const result = await provisionExtension(Number(info.lastInsertRowid));
    if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "We could not add this person yet. Please try again, or contact support."))}`);
  }
  redirect("/account/phone?saved=1");
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
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "The company name could not be saved. Check the name rules and try again."))}`);
  redirect("/account/phone?saved=department");
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
  const result = await updateRouting(user.id);
  audit(user.email, "pbx.hours", `${open}-${close}`);
  if (!result.ok) redirect(`/account/phone?error=${encodeURIComponent(safeCustomerError(result.message, "Hours were saved. Call routing still needs attention."))}`);
  redirect("/account/phone?saved=1");
}
