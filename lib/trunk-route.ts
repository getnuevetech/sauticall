export function extensionReady(input: { paid: boolean; emailVerified: boolean; phoneVerified: boolean; emailRequired: boolean; smsRequired: boolean }) {
  if (!input.paid) return false;
  if (input.emailRequired && !input.emailVerified) return false;
  if (input.smsRequired && !input.phoneVerified) return false;
  return true;
}

export function trunkNameFromAccount(account: string) {
  const name = account.trim();
  return /^[A-Za-z0-9_]{3,40}$/.test(name) ? name : "";
}

export function signupPersonName(full: string, email: string) {
  const cleaned = full.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(" ").filter(Boolean);
  const local = (email.split("@")[0] || "").replace(/[._+-]+/g, " ").trim();
  const bits = local.split(" ").filter(Boolean);
  if (parts.length >= 2) return { first: parts[0].slice(0, 40), last: parts.slice(1).join(" ").slice(0, 40) };
  if (parts.length === 1) return { first: parts[0].slice(0, 40), last: (bits[1] ? bits.slice(1).join(" ") : "Owner").slice(0, 40) };
  return { first: (bits[0] || "Owner").slice(0, 40), last: (bits.slice(1).join(" ") || "Account").slice(0, 40) };
}

export function routeDestination(to: "Extension" | "RingGroup", number: string, tags: "omit" | "delta" = "omit") {
  const destination: Record<string, unknown> = { To: to, Number: number, External: "", Name: "" };
  if (tags === "delta") destination.Tags = { "@odata.type": "#Collection(Pbx.UserTag)", delta: [] };
  return destination;
}

export function inboundDestinationUpdate(to: "Extension" | "RingGroup", number: string, tags: "omit" | "delta" = "omit") {
  const destination = routeDestination(to, number, tags);
  return {
    AlterDestinationDuringOutOfOfficeHours: true,
    AlterDestinationDuringHolidays: true,
    OfficeHoursDestination: destination,
    OutOfOfficeHoursDestination: destination,
    HolidaysDestination: destination,
  };
}

function inboundRule(input: { name: string; did: string; trunkId: number; to: "Extension" | "RingGroup"; number: string }, tags: "omit" | "delta") {
  const destination = routeDestination(input.to, input.number, tags);
  const rule: Record<string, unknown> = {
    RuleName: input.name,
    Data: input.did,
    Condition: "BasedOnDID",
    CallType: "AllCalls",
    TrunkDN: { Id: input.trunkId, Type: "ExternalLine" },
    OfficeHoursDestination: destination,
    OutOfOfficeHoursDestination: destination,
    HolidaysDestination: destination,
  };
  if (tags === "delta") rule.Hours = { Type: "AllHours", IgnoreHolidays: false, Periods: { "@odata.type": "#Collection(Pbx.Period)", delta: [] } };
  return rule;
}

export function inboundRuleAttempts(input: { name: string; did: string; trunkId: number; to: "Extension" | "RingGroup"; number: string }) {
  return [inboundRule(input, "omit"), inboundRule(input, "delta")];
}

export function trunkRouteAttempts(input: { did: string; to: "Extension" | "RingGroup"; number: string }) {
  const plain = inboundRule({ name: "Main", did: input.did, trunkId: 0, to: input.to, number: input.number }, "omit");
  const tagged = inboundRule({ name: "Main", did: input.did, trunkId: 0, to: input.to, number: input.number }, "delta");
  delete plain.TrunkDN;
  delete tagged.TrunkDN;
  return [
    { RoutingRules: [plain] },
    { RoutingRules: { delta: [tagged] } },
  ];
}

export function trunkStatusNote(input: {
  trunkId: number;
  trunkNumber: string;
  departmentName: string;
  departmentOnPbx: boolean;
  extension: string;
  extensionOnPbx: boolean;
  routeLabel: string;
  routeOnPbx: boolean;
  inboundOnPbx: boolean;
  outboundOnPbx: boolean;
  outboundAssigned: boolean;
  departmentLimited: boolean;
  from: string;
  to: string;
  account: string;
  host: string;
  detail: string;
}) {
  const department = input.departmentName || "this company";
  const parts = [
    input.trunkId ? `3CX trunk id ${input.trunkId}${input.trunkNumber ? `, internal number ${input.trunkNumber}` : ""}.` : "No 3CX trunk was created.",
    input.detail,
    input.departmentOnPbx ? `Department ${department} is on 3CX.` : `Department ${department} is not on 3CX.`,
    input.extensionOnPbx ? `Extension ${input.extension} is on 3CX.` : `Extension ${input.extension || "for this account"} is not on 3CX.`,
    input.routeOnPbx ? `Default route: ${input.routeLabel}, for office hours and after hours.` : `Default route is not on 3CX${input.routeLabel ? ` (${input.routeLabel})` : ""}.`,
    input.inboundOnPbx ? "Inbound route is on 3CX." : "Inbound route is not on 3CX.",
    input.outboundOnPbx
      ? `Outbound rule for extensions ${input.from}–${input.to} is on 3CX${input.outboundAssigned ? ` and assigned to ${department}` : `, but it is not assigned to ${department}`}.`
      : `Outbound rule for extensions ${input.from}–${input.to} is not on 3CX.`,
    input.departmentLimited ? "The trunk is limited to this department." : "The trunk is not limited to this department.",
  ];
  if (input.account) parts.push(`VoIP.ms SIP account ${input.account} at ${input.host || "the saved POP"}.`);
  return parts.filter(Boolean).join(" ");
}
