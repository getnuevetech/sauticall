export function extensionAddedNoticeIsOn(body: unknown) {
  const record = noticeRecord(body);
  if (!record || !("NotifyExtensionAdded" in record)) return true;
  return record.NotifyExtensionAdded !== false;
}

function noticeRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  if ("NotifyExtensionAdded" in body) return body as Record<string, unknown>;
  const value = (body as { value?: unknown }).value;
  if (!Array.isArray(value)) return null;
  const found = value.find((item) => item && typeof item === "object" && "NotifyExtensionAdded" in item);
  return found && typeof found === "object" ? found as Record<string, unknown> : null;
}

export function webClientUrl(base: string) {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return `${trimmed}/webclient`;
}

export function extensionWelcomeText(input: { firstName: string; number: string; email: string; webClient: string }) {
  const where = input.webClient ? ` at ${input.webClient}` : "";
  return [
    `Hello ${input.firstName},`,
    "",
    "This setup email is from SautiCall.",
    "",
    `Your extension is ${input.number}.`,
    "",
    `Sign in to the 3CX web client${where}. Use ${input.email}. The app password is on your SautiCall account, under Phone system. It stays hidden until you reveal it.`,
    "",
    "Set up the 3CX phone app:",
    "1. Install 3CX on your phone, or open the web client.",
    `2. Sign in with ${input.email} and the app password from SautiCall.`,
    `3. Your extension is ${input.number}.`,
    "",
    "For a 3CX desk phone, contact SautiCall support and we will help you set it up.",
    "",
    "This extension cannot make or receive calls until you buy a business number in your SautiCall account. After that number is bought, it is connected for inbound and outbound calls.",
  ].join("\n");
}

export function welcomeCustomerNote(sent: boolean) {
  return sent
    ? "A setup email was sent to this address."
    : "The setup email could not be sent yet. The team has the details.";
}
