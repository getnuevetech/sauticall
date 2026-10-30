import { getDb } from "./db";
import { money, readGatewaySecret, stripeSignatureOk } from "./payment-keys";

type GatewayRow = {
  id: number;
  provider_key: string;
  public_label: string;
  enabled: number;
  mode: string;
  currencies: string;
  config_json: string;
  secret: string;
};

type AttemptRow = {
  id: number;
  user_id: number;
  gateway_id: number;
  amount_cents: number;
  currency: string;
  description: string;
  status: string;
  provider_ref: string;
  checkout_url: string;
  plan_name?: string;
  product_kind?: string;
};

export type PublicGatewayConfig = {
  publishable_key: string;
  client_id: string;
  application_id: string;
  location_id: string;
};

export function publicGatewayConfig(raw: string): PublicGatewayConfig {
  const empty = { publishable_key: "", client_id: "", application_id: "", location_id: "" };
  try {
    const value = JSON.parse(raw) as Partial<PublicGatewayConfig>;
    return {
      publishable_key: String(value.publishable_key || ""),
      client_id: String(value.client_id || ""),
      application_id: String(value.application_id || ""),
      location_id: String(value.location_id || ""),
    };
  } catch {
    return empty;
  }
}

function gatewayById(id: number) {
  return getDb().prepare("SELECT * FROM gateways WHERE id = ?").get(id) as GatewayRow | undefined;
}

function attemptById(id: number) {
  return getDb().prepare("SELECT * FROM payment_attempts WHERE id = ?").get(id) as AttemptRow | undefined;
}

async function postForm(url: string, headers: Record<string, string>, body: URLSearchParams) {
  const response = await fetch(url, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function paypalHost(mode: string) {
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function squareHost(mode: string) {
  return mode === "live" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}

async function paypalToken(gateway: GatewayRow, secret: string) {
  const config = publicGatewayConfig(gateway.config_json);
  const basic = Buffer.from(`${config.client_id}:${secret}`).toString("base64");
  const { response, payload } = await postForm(`${paypalHost(gateway.mode)}/v1/oauth2/token`, {
    authorization: `Basic ${basic}`,
    "content-type": "application/x-www-form-urlencoded",
  }, new URLSearchParams("grant_type=client_credentials"));
  const token = payload && typeof payload === "object" ? String((payload as { access_token?: string }).access_token || "") : "";
  if (!response.ok || !token) throw new Error("PayPal did not accept the client ID and secret.");
  return token;
}

export async function testGateway(id: number) {
  const gateway = gatewayById(id);
  if (!gateway) return { ok: false, message: "That way to pay was not found." };
  const secret = readGatewaySecret(gateway.secret);
  const config = publicGatewayConfig(gateway.config_json);
  try {
    if (!secret.key) throw new Error("Save the API secret first.");
    if (gateway.provider_key === "stripe") {
      const response = await fetch("https://api.stripe.com/v1/balance", {
        headers: { authorization: `Bearer ${secret.key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "Stripe did not accept the secret key.");
    } else if (gateway.provider_key === "paypal") {
      if (!config.client_id) throw new Error("Save the PayPal client ID first.");
      await paypalToken(gateway, secret.key);
    } else if (gateway.provider_key === "square") {
      if (!config.location_id) throw new Error("Save the Square location ID first.");
      const response = await fetch(`${squareHost(gateway.mode)}/v2/locations/${encodeURIComponent(config.location_id)}`, {
        headers: { authorization: `Bearer ${secret.key}`, "Square-Version": "2026-09-16" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const payload = (await response.json().catch(() => null)) as { errors?: { detail?: string }[] } | null;
      if (!response.ok) throw new Error(payload?.errors?.[0]?.detail || "Square did not accept the access token.");
    } else {
      throw new Error("This payment company is not connected yet.");
    }
    const message = gateway.mode === "live" ? "Connected. Real payments can use these keys." : "Connected. Practice payments can use these keys.";
    getDb().prepare("UPDATE gateways SET last_ok = 1, last_message = ?, checked_at = ? WHERE id = ?").run(message, new Date().toISOString(), id);
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The payment company could not be reached.";
    getDb().prepare("UPDATE gateways SET last_ok = 0, last_message = ?, checked_at = ? WHERE id = ?").run(message.slice(0, 400), new Date().toISOString(), id);
    const { recordFailure } = await import("./failure-log");
    recordFailure({ area: "payment", subject: `gateway ${id}`, detail: message });
    return { ok: false, message };
  }
}

export async function requestOrigin() {
  const { headers } = await import("next/headers");
  const configured = process.env["SAUTICALL_PUBLIC_ORIGIN"];
  if (configured) return new URL(configured).origin;
  const headerList = await headers();
  const host = (headerList.get("x-forwarded-host") || headerList.get("host") || "127.0.0.1").split(",")[0].trim();
  const proto = headerList.get("x-forwarded-proto") || "http";
  return new URL(`${proto}://${host}`).origin;
}

export async function beginCheckout(attemptId: number, origin: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const attempt = attemptById(attemptId);
  const gateway = attempt ? gatewayById(attempt.gateway_id) : undefined;
  if (!attempt || !gateway || !gateway.enabled) return { ok: false, message: "This way to pay is not available." };
  const secret = readGatewaySecret(gateway.secret);
  const config = publicGatewayConfig(gateway.config_json);
  if (!secret.key) return { ok: false, message: "This way to pay has no API secret yet." };
  try {
    if (gateway.provider_key === "stripe") {
      const body = new URLSearchParams();
      body.set("mode", "payment");
      body.set("success_url", `${origin}/pay/${attempt.id}?session_id={CHECKOUT_SESSION_ID}`);
      body.set("cancel_url", `${origin}/pay/${attempt.id}?cancelled=1`);
      body.set("client_reference_id", String(attempt.id));
      body.set("line_items[0][quantity]", "1");
      body.set("line_items[0][price_data][currency]", attempt.currency.toLowerCase());
      body.set("line_items[0][price_data][unit_amount]", String(attempt.amount_cents));
      body.set("line_items[0][price_data][product_data][name]", attempt.description);
      const { response, payload } = await postForm("https://api.stripe.com/v1/checkout/sessions", {
        authorization: `Bearer ${secret.key}`,
        "content-type": "application/x-www-form-urlencoded",
      }, body);
      const session = payload as { id?: string; url?: string; error?: { message?: string } } | null;
      if (!response.ok || !session?.id || !session.url) throw new Error(session?.error?.message || "Stripe did not start checkout.");
      saveCheckout(attempt.id, session.id, session.url);
      return { ok: true, url: session.url };
    }
    if (gateway.provider_key === "paypal") {
      const token = await paypalToken(gateway, secret.key);
      const response = await fetch(`${paypalHost(gateway.mode)}/v2/checkout/orders`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ custom_id: String(attempt.id), amount: { currency_code: attempt.currency, value: money(attempt.amount_cents) } }],
          payment_source: { paypal: { experience_context: { return_url: `${origin}/pay/${attempt.id}`, cancel_url: `${origin}/pay/${attempt.id}?cancelled=1`, user_action: "PAY_NOW" } } },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const order = (await response.json().catch(() => null)) as { id?: string; links?: { rel?: string; href?: string }[]; message?: string; details?: { description?: string; issue?: string }[] } | null;
      const url = order?.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
      const paypalDetail = order?.details?.map((item) => item.description || item.issue || "").filter(Boolean).join("; ");
      if (!response.ok || !order?.id || !url) throw new Error(paypalDetail || order?.message || "PayPal did not start checkout.");
      saveCheckout(attempt.id, order.id, url);
      return { ok: true, url };
    }
    if (gateway.provider_key === "square") {
      if (!config.location_id) throw new Error("Square needs a location ID.");
      const response = await fetch(`${squareHost(gateway.mode)}/v2/online-checkout/payment-links`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret.key}`, "content-type": "application/json", "Square-Version": "2026-09-16" },
        body: JSON.stringify({
          idempotency_key: `sauticall-${attempt.id}`,
          quick_pay: { name: attempt.description.slice(0, 255), price_money: { amount: attempt.amount_cents, currency: attempt.currency }, location_id: config.location_id },
          checkout_options: { redirect_url: `${origin}/pay/${attempt.id}` },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const payload = (await response.json().catch(() => null)) as { payment_link?: { url?: string; order_id?: string }; errors?: { detail?: string }[] } | null;
      const link = payload?.payment_link;
      if (!response.ok || !link?.url || !link.order_id) throw new Error(payload?.errors?.[0]?.detail || "Square did not start checkout.");
      saveCheckout(attempt.id, link.order_id, link.url);
      return { ok: true, url: link.url };
    }
    return { ok: false, message: "This payment company is not connected yet." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not start.";
    getDb().prepare("UPDATE payment_attempts SET status = 'failed' WHERE id = ? AND status = 'pending'").run(attempt.id);
    const { recordFailure } = await import("./failure-log");
    recordFailure({ area: "payment", userId: attempt.user_id, subject: `${gateway?.provider_key || "payment"} ${attempt.id}`, detail: message });
    return { ok: false, message };
  }
}

function saveCheckout(id: number, providerRef: string, url: string) {
  getDb().prepare("UPDATE payment_attempts SET provider_ref = ?, checkout_url = ? WHERE id = ?").run(providerRef, url, id);
}

async function markPaid(id: number) {
  const info = getDb().prepare("UPDATE payment_attempts SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'").run(new Date().toISOString(), id);
  if (!info.changes) return;
  const { grantForPayment, enforceUser } = await import("./minutes");
  grantForPayment(id);
  const attempt = attemptById(id);
  if (attempt?.user_id) await enforceUser(attempt.user_id);
  if (attempt?.user_id && attempt.product_kind !== "bundle" && attempt.plan_name) {
    const { fundPaidPlanWithRetry } = await import("./voip-client");
    await fundPaidPlanWithRetry(attempt.user_id, attempt.plan_name);
  }
}

export async function confirmReturn(attemptId: number, query: { session_id?: string; token?: string; orderId?: string; cancelled?: string }) {
  const attempt = attemptById(attemptId);
  if (!attempt || attempt.status === "paid") return;
  if (query.cancelled === "1" && attempt.status === "pending") {
    getDb().prepare("UPDATE payment_attempts SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(attempt.id);
    return;
  }
  const gateway = gatewayById(attempt.gateway_id);
  if (!gateway) return;
  const secret = readGatewaySecret(gateway.secret);
  if (!secret.key || !attempt.provider_ref) return;
  try {
    if (gateway.provider_key === "stripe" && query.session_id === attempt.provider_ref) {
      const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(attempt.provider_ref)}`, {
        headers: { authorization: `Bearer ${secret.key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const session = (await response.json().catch(() => null)) as { payment_status?: string; amount_total?: number; client_reference_id?: string; currency?: string } | null;
      if (response.ok && session?.payment_status === "paid" && session.client_reference_id === String(attempt.id) && session.amount_total === attempt.amount_cents && session.currency?.toUpperCase() === attempt.currency) {
        await markPaid(attempt.id);
      }
    } else if (gateway.provider_key === "paypal" && query.token === attempt.provider_ref) {
      const token = await paypalToken(gateway, secret.key);
      const response = await fetch(`${paypalHost(gateway.mode)}/v2/checkout/orders/${encodeURIComponent(attempt.provider_ref)}/capture`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const order = (await response.json().catch(() => null)) as { status?: string; purchase_units?: { amount?: { value?: string; currency_code?: string }; custom_id?: string }[] } | null;
      const unit = order?.purchase_units?.[0];
      if (response.ok && order?.status === "COMPLETED" && unit?.custom_id === String(attempt.id) && unit.amount?.value === money(attempt.amount_cents) && unit.amount.currency_code === attempt.currency) {
        await markPaid(attempt.id);
      }
    } else if (gateway.provider_key === "square" && (!query.orderId || query.orderId === attempt.provider_ref)) {
      const response = await fetch(`${squareHost(gateway.mode)}/v2/orders/${encodeURIComponent(attempt.provider_ref)}`, {
        headers: { authorization: `Bearer ${secret.key}`, "Square-Version": "2026-09-16" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const payload = (await response.json().catch(() => null)) as { order?: { state?: string; total_money?: { amount?: number; currency?: string } } } | null;
      const order = payload?.order;
      if (response.ok && order?.state === "COMPLETED" && order.total_money?.amount === attempt.amount_cents && order.total_money.currency === attempt.currency) {
        await markPaid(attempt.id);
      }
    }
  } catch {
    return;
  }
}

export async function applyStripeEvent(raw: string, header: string) {
  const rows = getDb().prepare("SELECT id, secret FROM gateways WHERE provider_key = 'stripe' AND secret != ''").all() as { id: number; secret: string }[];
  const gateway = rows.find((row) => stripeSignatureOk(raw, header, readGatewaySecret(row.secret).webhook));
  if (!gateway) return false;
  const event = JSON.parse(raw) as { type?: string; data?: { object?: { payment_status?: string; client_reference_id?: string; amount_total?: number; currency?: string } } };
  if (event.type !== "checkout.session.completed") return true;
  const session = event.data?.object;
  const attemptId = Number(session?.client_reference_id || 0);
  const attempt = attemptById(attemptId);
  if (!attempt || attempt.gateway_id !== gateway.id || attempt.status !== "pending") return true;
  if (session?.payment_status === "paid" && session.amount_total === attempt.amount_cents && session.currency?.toUpperCase() === attempt.currency) await markPaid(attempt.id);
  return true;
}
