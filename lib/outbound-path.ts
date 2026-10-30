export type TrunkOutcome = "ready" | "failed" | "unknown" | "absent";

export function trunkOutcome(status: string, trunkId: number): TrunkOutcome {
  if (status === "trunk_live" && trunkId > 0) return "ready";
  if (status === "trunk_done") return "unknown";
  if (status === "trunk_waiting" && trunkId > 0) return "unknown";
  if (status === "trunk_waiting") return "failed";
  return "absent";
}

export function bestTrunk(lines: { status: string; trunkId: number }[]): TrunkOutcome {
  const outcomes = lines.map((line) => trunkOutcome(line.status, line.trunkId));
  if (outcomes.includes("ready")) return "ready";
  if (outcomes.includes("unknown")) return "unknown";
  if (outcomes.includes("failed")) return "failed";
  return "absent";
}

export function outboundChoice(input: { trunk: TrunkOutcome; backupEnabled: boolean; customerClient: boolean }) {
  const placeCall = false as const;
  if (input.trunk === "ready") {
    return { path: "3cx" as const, placeCall, reason: "Outbound uses this customer's 3CX extension and trunk." };
  }
  if (input.trunk === "unknown") {
    return { path: "none" as const, placeCall, reason: "The 3CX trunk is not confirmed, so the VoIP.ms backup stays closed." };
  }
  if (input.trunk !== "failed") {
    return { path: "none" as const, placeCall, reason: "No 3CX trunk is on this number yet. The VoIP.ms backup stays closed until a trunk attempt fails." };
  }
  if (!input.backupEnabled) {
    return { path: "none" as const, placeCall, reason: "3CX did not add the trunk. VoIP.ms backup is off. Only an administrator can turn it on in Platform controls." };
  }
  if (!input.customerClient) {
    return { path: "none" as const, placeCall, reason: "3CX did not add the trunk. VoIP.ms backup is on, and this customer still needs a VoIP.ms client." };
  }
  return { path: "voipms" as const, placeCall, reason: "3CX did not add the trunk. VoIP.ms backup can use this customer's client account. No call is placed from here." };
}
