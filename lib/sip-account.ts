export const TRUNK_SIP_DEFAULTS: Record<string, string> = {
  protocol: "1",
  device_type: "2",
  lock_international: "1",
  international_route: "1",
  canada_routing: "2",
  music_on_hold: "none",
  allowed_codecs: "ulaw;g729",
  dtmf_mode: "auto",
  nat: "yes",
  allow225: "0",
  language: "en",
  record_calls: "0",
  sip_traffic: "0",
  max_expiry: "3600",
  rtp_timeout: "60",
  rtp_hold_timeout: "600",
};

export function sipUsernameCandidates(code: string) {
  const compact = code.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return /^[A-Za-z0-9]{1,12}$/.test(compact) ? [compact] : [];
}

export function callerIdDigits(did: string) {
  const digits = did.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (/^[2-9]\d{9}$/.test(digits)) return digits;
  return "";
}
