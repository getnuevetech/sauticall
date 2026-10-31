const INTERNAL = /3cx|voip\.?\s*ms|\bxapi\b|\bodata\b|stripe|paypal|square|\bsip\b|api secret|api key|client secret|access token|system owner|invalid_credentials|not_configured|\bbearer\b|econn|fetch failed|https?:\/\/|\btrunk\b|the carrier returned|answered \d{3}|stack trace|query specified in the uri|top query|\$top/i;

export function customerMessage(message: string, fallback: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (INTERNAL.test(text)) return fallback;
  return text;
}

export function safeCustomerError(detail: string, fallback: string) {
  const safe = customerMessage(detail, fallback);
  if (safe !== detail.replace(/\s+/g, " ").trim()) console.error(`[sauticall] ${detail}`);
  return safe;
}

export function extensionEmailConflict(detail: string) {
  const text = detail.replace(/\s+/g, " ").trim();
  return /email/i.test(text) && /already|duplicate|unique|exists|in use|taken/i.test(text);
}

export function extensionCustomerMessage(detail: string) {
  if (extensionEmailConflict(detail)) return "That email is already used for an extension. Use a different email.";
  return safeCustomerError(detail, "This person could not be added. Check the name and email, then try again.");
}

export function customerRequestStatus(status: string) {
  const labels: Record<string, string> = {
    requested: "Saved",
    submitted: "Sent",
    ordered: "Bought",
    completed: "Done",
    exception: "Needs attention",
    cancelled: "Cancelled",
  };
  return labels[status] || "In progress";
}
