export function signupPersonName(full: string, email: string) {
  const cleaned = full.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(" ").filter(Boolean);
  const local = (email.split("@")[0] || "").replace(/[._+-]+/g, " ").trim();
  const bits = local.split(" ").filter(Boolean);
  if (parts.length >= 2) return { first: parts[0].slice(0, 40), last: parts.slice(1).join(" ").slice(0, 40) };
  if (parts.length === 1) return { first: parts[0].slice(0, 40), last: (bits[1] ? bits.slice(1).join(" ") : "Owner").slice(0, 40) };
  return { first: (bits[0] || "Owner").slice(0, 40), last: (bits.slice(1).join(" ") || "Account").slice(0, 40) };
}

export function callDestination(to: "Extension" | "RingGroup", number: string) {
  return { "@odata.type": "#Pbx.Destination", To: to, Number: number, External: "", Name: "" };
}

export function inboundRuleAttempts(input: { name: string; did: string; trunkId: number; to: "Extension" | "RingGroup"; number: string }) {
  const destination = callDestination(input.to, input.number);
  const plain = { To: input.to, Number: input.number, External: "", Name: "" };
  const linked = {
    RuleName: input.name,
    Data: input.did,
    TrunkDN: { Id: input.trunkId },
    OfficeHoursDestination: destination,
    OutOfOfficeHoursDestination: destination,
    HolidaysDestination: destination,
  };
  const bound = {
    RuleName: input.name,
    Data: input.did,
    "TrunkDN@odata.bind": `Trunks(${input.trunkId})`,
    OfficeHoursDestination: plain,
    OutOfOfficeHoursDestination: plain,
    HolidaysDestination: plain,
  };
  return [linked, bound];
}

export function trunkRoutePatch(input: { did: string; to: "Extension" | "RingGroup"; number: string }) {
  const destination = callDestination(input.to, input.number);
  return {
    RoutingRules: {
      "@odata.type": "#Collection(Pbx.InboundRule)",
      delta: [{
        "@odata.type": "#Pbx.InboundRule",
        RuleName: "Main",
        Data: input.did,
        OfficeHoursDestination: destination,
        OutOfOfficeHoursDestination: destination,
        HolidaysDestination: destination,
      }],
    },
  };
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
  if (input.detail) parts.push(input.detail);
  return parts.join(" ");
}
