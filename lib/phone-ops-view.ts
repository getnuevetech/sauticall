export function companyMatches(ownerId: number, selected: number) {
  return ownerId > 0 && selected > 0 && ownerId === selected;
}

export function maskCredential(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= 2 ? "••••" : `••••${trimmed.slice(-2)}`;
}

export function formatDid(did: string) {
  const digits = did.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return did;
  return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function setupStatus(input: { records: number; failed: number; waiting: number; live: number }) {
  if (input.failed > 0) return "attention" as const;
  if (input.records > 0 && input.live === input.records && input.waiting === 0) return "provisioned" as const;
  if (input.records === 0) return "empty" as const;
  return "pending" as const;
}

export function setupLabel(status: ReturnType<typeof setupStatus>) {
  if (status === "attention") return "Needs attention";
  if (status === "provisioned") return "Provisioned";
  if (status === "pending") return "Pending";
  return "No records";
}

export function personState(status: string) {
  if (status === "created") return { label: "On phone system", tone: "ok" as const, detail: "On the phone system" };
  if (status === "failed") return { label: "Needs attention", tone: "warn" as const, detail: "Provisioning failed" };
  if (status === "removed") return { label: "Record kept", tone: "muted" as const, detail: "Removed from the phone system" };
  if (status === "manual") return { label: "Recorded manually", tone: "ok" as const, detail: "Marked done by an administrator" };
  return { label: "Pending", tone: "muted" as const, detail: "Not on the phone system yet" };
}

export function trunkStep(input: { hasAccount: boolean; trunkId: number; status: string }) {
  const provider = input.hasAccount ? "Ready" : "Not ready";
  if (input.status === "trunk_live") return { provider, trunk: "Ready", routing: "Saved, not verified" };
  if (input.status === "trunk_done") return { provider, trunk: "Recorded manually", routing: "Not verified" };
  if (input.trunkId) return { provider, trunk: "Ready", routing: "Needs attention" };
  if (input.status === "trunk_waiting") return { provider, trunk: "Failed", routing: "Not verified" };
  return { provider, trunk: "Not started", routing: "Not verified" };
}

export function lineStatusLabel(status: string) {
  if (status === "trunk_live") return "Provisioned";
  if (status === "trunk_done") return "Recorded manually";
  if (status === "trunk_waiting") return "Needs attention";
  if (status === "ordered") return "Pending";
  if (status === "not_on_carrier") return "Not on provider";
  return status || "Pending";
}
