import crypto from "crypto";

export type GatewaySecret = { key: string; webhook: string };

export function readGatewaySecret(raw: string): GatewaySecret {
  if (!raw) return { key: "", webhook: "" };
  try {
    const parsed = JSON.parse(raw) as { key?: unknown; webhook?: unknown };
    if (parsed && typeof parsed === "object" && ("key" in parsed || "webhook" in parsed)) {
      return { key: String(parsed.key || ""), webhook: String(parsed.webhook || "") };
    }
  } catch {
    return { key: raw, webhook: "" };
  }
  return { key: raw, webhook: "" };
}

export function writeGatewaySecret(secret: GatewaySecret) {
  return JSON.stringify({ key: secret.key, webhook: secret.webhook });
}

export function stripeSecretMatches(mode: string, key: string) {
  if (!key) return false;
  return mode === "live" ? key.startsWith("sk_live_") || key.startsWith("rk_live_") : key.startsWith("sk_test_") || key.startsWith("rk_test_");
}

export function stripePublishableMatches(mode: string, key: string) {
  if (!key) return false;
  return mode === "live" ? key.startsWith("pk_live_") : key.startsWith("pk_test_");
}

export function stripeSignatureOk(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), part.slice(index + 1)];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature || !secret) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function money(cents: number) {
  return (cents / 100).toFixed(2);
}
