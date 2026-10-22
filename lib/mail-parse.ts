export type ParsedMail = {
  fromEmail: string;
  fromName: string;
  subject: string;
  text: string;
  messageId: string;
  referenceIds: string[];
};

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function headerValue(record: Record<string, unknown>, name: string) {
  const headers = record.Headers ?? record.headers;
  if (Array.isArray(headers)) {
    const found = headers.find((item) => item && typeof item === "object" && String((item as { Name?: unknown; name?: unknown }).Name || (item as { name?: unknown }).name || "").toLowerCase() === name.toLowerCase());
    if (found && typeof found === "object") return String((found as { Value?: unknown; value?: unknown }).Value || (found as { value?: unknown }).value || "");
  }
  if (typeof headers === "string") {
    const match = headers.match(new RegExp(`^${name}:\\s*(.*)$`, "im"));
    return match?.[1]?.trim() || "";
  }
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name.toLowerCase()) return String(value ?? "");
    }
  }
  return "";
}

export function normalizeMessageId(value: string) {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function addressFrom(value: string) {
  const trimmed = value.trim();
  const angle = trimmed.match(/^(.*)<([^>]+)>$/);
  const email = (angle ? angle[2] : trimmed).trim().toLowerCase();
  const name = (angle ? angle[1] : "").replace(/"/g, "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { email, name };
}

function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function ticketIdFromText(value: string) {
  const match = value.match(/\bSC-(\d+)\b/i);
  return match ? Number(match[1]) : 0;
}

export function parseMailPayload(input: unknown): ParsedMail | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  let fromEmail = "";
  let fromName = "";
  const fromFull = record.FromFull;
  if (fromFull && typeof fromFull === "object" && "Email" in fromFull) {
    const parsed = addressFrom(String((fromFull as { Email?: unknown }).Email || ""));
    if (parsed) {
      fromEmail = parsed.email;
      fromName = String((fromFull as { Name?: unknown }).Name || parsed.name);
    }
  }
  if (!fromEmail) {
    const parsed = addressFrom(firstString(record, ["from", "From", "sender", "Sender", "mail_from"]));
    if (parsed) {
      fromEmail = parsed.email;
      fromName = parsed.name;
    }
  }
  if (!fromEmail) return null;
  const subject = firstString(record, ["subject", "Subject"]).replace(/\s+/g, " ").trim();
  const text = firstString(record, ["text", "TextBody", "body-plain", "stripped-text", "plain", "body"]);
  const html = firstString(record, ["html", "HtmlBody", "body-html"]);
  const messageId = normalizeMessageId(firstString(record, ["messageId", "MessageID", "Message-Id", "message-id"]) || headerValue(record, "Message-ID"));
  const referenceBlob = [
    firstString(record, ["inReplyTo", "InReplyTo", "in-reply-to"]),
    firstString(record, ["references", "References"]),
    headerValue(record, "In-Reply-To"),
    headerValue(record, "References"),
  ].join(" ");
  const referenceIds = [...referenceBlob.matchAll(/<[^>]+>/g)].map((match) => normalizeMessageId(match[0])).filter(Boolean);
  const body = (text || stripHtml(html)).slice(0, 20000);
  return { fromEmail, fromName, subject, text: body, messageId, referenceIds: [...new Set(referenceIds)] };
}
