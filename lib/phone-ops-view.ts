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

export function trunkProgress(input: {
  hasAccount: boolean;
  departmentOnPbx: boolean;
  extensionOnPbx: boolean;
  routeLabel: string;
  routeOnPbx: boolean;
  trunkId: number;
  status: string;
  inboundOnPbx: boolean;
  outboundOnPbx: boolean;
  outboundAssigned: boolean;
  departmentLimited: boolean;
}) {
  const provider = input.hasAccount ? "Ready" : "Not ready";
  const department = input.departmentOnPbx ? "On 3CX" : "Not on 3CX";
  const extension = input.extensionOnPbx ? "On 3CX" : "Not on 3CX";
  const route = input.routeOnPbx ? (input.routeLabel || "On 3CX") : "Not created";
  let trunk = "Not started";
  if (input.status === "trunk_live" || input.status === "trunk_done") trunk = "Registered";
  else if (input.trunkId) trunk = "Saved";
  else if (input.status === "trunk_waiting") trunk = "Not created";
  const inbound = input.inboundOnPbx ? "On 3CX" : "Not on 3CX";
  const outbound = !input.outboundOnPbx ? "Not on 3CX" : input.outboundAssigned ? "On 3CX, assigned to the department" : "On 3CX, not assigned to the department";
  const limit = input.departmentLimited ? "Limited to the department" : "Not limited to the department";
  return { provider, department, extension, route, trunk, inbound, outbound, limit };
}

export function trunkTone(label: string) {
  if (
    label === "Ready"
    || label === "Registered"
    || label === "Certified"
    || label === "On 3CX"
    || label === "Limited to the department"
    || label === "On 3CX, assigned to the department"
    || label.startsWith("Ring group")
    || label.startsWith("AI receptionist")
  ) return "ok" as const;
  if (label === "Saved") return "muted" as const;
  return "bad" as const;
}

export function trunkAdminSummary(input: ReturnType<typeof trunkProgress>) {
  const missing: string[] = [];
  if (input.department !== "On 3CX") missing.push("the department");
  if (input.extension !== "On 3CX") missing.push("the default extension");
  if (input.route === "Not created") missing.push("the ring group or AI receptionist");
  if (input.trunk === "Not created" || input.trunk === "Not started" || input.trunk === "Failed") missing.push("the 3CX trunk");
  if (input.inbound !== "On 3CX") missing.push("the inbound route");
  if (input.outbound === "Not on 3CX") missing.push("the outbound rule");
  if (input.outbound.startsWith("On 3CX, not assigned")) missing.push("the outbound rule assignment");
  if (input.limit !== "Limited to the department") missing.push("the department limit");
  if (!missing.length && (input.trunk === "Registered" || input.trunk === "Certified")) return "This trunk is registered on 3CX. The department, default route, inbound route, and outbound rule are saved. No call was placed.";
  if (!missing.length) return "The department, default route, inbound route, and outbound rule are saved. 3CX has not shown this trunk as registered yet.";
  return `Still missing: ${missing.join(", ")}.`;
}

export function trunkStep(input: { hasAccount: boolean; trunkId: number; status: string }) {
  const provider = input.hasAccount ? "Ready" : "Not ready";
  if (input.status === "trunk_live" || input.status === "trunk_done") return { provider, trunk: "Ready", routing: "Certified" };
  if (input.trunkId) return { provider, trunk: "Ready", routing: "Needs attention" };
  if (input.status === "trunk_waiting") return { provider, trunk: "Failed", routing: "Not verified" };
  return { provider, trunk: "Not started", routing: "Not verified" };
}

export function setupEmailState(detail: string, note = "") {
  const text = `${detail} ${note}`;
  const failed = /setup email failed|the setup email could not be sent|outgoing email is not set up/i.test(text);
  const sent = /SautiCall sent the setup email/i.test(detail) || (/a setup email was sent/i.test(note) && !/setup email failed/i.test(detail));
  if (sent && !failed) return { key: "sent" as const, label: "Sent", tone: "muted" as const, cause: "" };
  if (failed) {
    const cause = detail.split(/setup email failed:\s*/i)[1]?.trim() || "";
    return { key: "failed" as const, label: "Delivery failed", tone: "warn" as const, cause };
  }
  return { key: "none" as const, label: "Not sent", tone: "muted" as const, cause: "" };
}

export function lineStatusLabel(status: string) {
  if (status === "trunk_live" || status === "trunk_done") return "Provisioned";
  if (status === "trunk_waiting") return "Needs attention";
  if (status === "ordered") return "Pending";
  if (status === "not_on_carrier") return "Not on provider";
  return status || "Pending";
}
