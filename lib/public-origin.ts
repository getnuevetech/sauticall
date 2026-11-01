export const PUBLIC_SITE_ORIGIN = "https://sauticall.com";

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function hostnameOf(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
}

export function hostIsIp(host: string) {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (IPV4.test(bare)) return true;
  return bare.includes(":");
}

export function hostIsLocal(host: string) {
  const bare = host.split("%")[0].replace(/^\[|\]$/g, "").toLowerCase();
  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1" || bare.endsWith(".localhost");
}

/** Public site origin. An IP address, a missing value, or localhost becomes https://sauticall.com. */
export function publicSiteOrigin(configured = "") {
  const host = hostnameOf(configured);
  if (!host || hostIsIp(host) || hostIsLocal(host) || !host.includes(".")) return PUBLIC_SITE_ORIGIN;
  try {
    const url = new URL(configured.trim().includes("://") ? configured.trim() : `https://${configured.trim()}`);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    return PUBLIC_SITE_ORIGIN;
  }
  return PUBLIC_SITE_ORIGIN;
}

export function inboundMailEndpoint(configured = "") {
  return `${publicSiteOrigin(configured)}/api/tickets/inbound`;
}

/** Links for this request. Local development stays on localhost. A public IP uses sauticall.com. */
export function requestSiteOrigin(input: { configured?: string; host?: string; proto?: string }) {
  const forwarded = (input.host || "").split(",")[0].trim();
  const hostname = hostnameOf(forwarded ? (forwarded.includes("://") ? forwarded : `http://${forwarded}`) : "");
  if (hostname && hostIsLocal(hostname)) {
    const proto = input.proto === "https" ? "https" : "http";
    try {
      return new URL(`${proto}://${forwarded}`).origin;
    } catch {
      return "http://127.0.0.1";
    }
  }
  return publicSiteOrigin(input.configured || "");
}
