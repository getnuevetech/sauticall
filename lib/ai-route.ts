import { normalizeMobile } from "./verify-code.ts";

export type RouteScope = "scoped" | "open" | "unknown" | "timeout" | "absent";

export type RouteExtension = { number: string; xapiId: number; status: string };
export type RouteTrunk = { did: string; trunkId: number; status: string };
export type RouteClient = {
  account: string;
  username: string;
  sipHost: string;
  clientId: string;
  resellerClient: string;
};

export type CustomerRouteInput = {
  extension: RouteExtension | null;
  spanFrom: string;
  spanTo: string;
  trunk: RouteTrunk | null;
  presentedCallerId: string;
  scope: RouteScope;
  client: RouteClient | null;
  resellerLogin: string;
};

export type RouteLine = {
  name: "extension" | "trunk" | "caller_id" | "backup" | "idle";
  state: "ready" | "blocked" | "unknown" | "withheld";
  text: string;
};

export type RouteVerdict = {
  idle: true;
  placeCall: false;
  primary: "ready" | "blocked" | "unknown";
  backup: "customer_account" | "rejected" | "withheld";
  path: "customer_3cx" | "none";
  scope: RouteScope;
  extensionNumber: string;
  trunkId: number;
  callerId: string;
  clientAccount: string;
  clientId: string;
  sipHost: string;
  lines: RouteLine[];
};

const IDLE_TEXT = "The line stays idle. No call is placed.";

export function savedTrunkScope(trunk: { trunkId: number; status: string } | null): RouteScope {
  if (!trunk) return "absent";
  if (trunk.trunkId > 0 && trunk.status === "trunk_live") return "scoped";
  if (trunk.status === "trunk_waiting" || trunk.status === "trunk_done" || trunk.trunkId > 0) return "unknown";
  return "absent";
}

export function selectSavedTrunk(lines: RouteTrunk[], presentedCallerId: string) {
  const presented = normalizeMobile(presentedCallerId);
  const live = lines.filter((line) => line.trunkId > 0 && line.status === "trunk_live");
  const matched = presented ? live.find((line) => normalizeMobile(line.did) === presented) : undefined;
  if (matched || live[0]) return { trunk: matched || live[0], scope: "scoped" as const };
  const pending = lines.find((line) => line.status === "trunk_waiting" || line.status === "trunk_done" || line.trunkId > 0);
  if (pending) return { trunk: pending, scope: "unknown" as const };
  return { trunk: lines[0] || null, scope: "absent" as const };
}

function inSpan(number: string, from: string, to: string) {
  if (!/^\d+$/.test(number) || !/^\d+$/.test(from) || !/^\d+$/.test(to)) return false;
  const value = Number(number);
  const start = Number(from);
  const end = Number(to);
  return value >= Math.min(start, end) && value <= Math.max(start, end);
}

function sameAccount(left: string, right: string) {
  const a = left.trim();
  const b = right.trim();
  return a !== "" && b !== "" && a.toLowerCase() === b.toLowerCase();
}

function extensionCheck(input: CustomerRouteInput): { ok: boolean; line: RouteLine } {
  const extension = input.extension;
  const span = `${input.spanFrom}–${input.spanTo}`;
  if (!extension) return { ok: false, line: { name: "extension", state: "blocked", text: "No extension is saved for this customer." } };
  if (extension.status !== "created" || extension.xapiId <= 0) {
    return { ok: false, line: { name: "extension", state: "blocked", text: `Extension ${extension.number || "unknown"} is not on this customer's phone system.` } };
  }
  if (!inSpan(extension.number, input.spanFrom, input.spanTo)) {
    return { ok: false, line: { name: "extension", state: "blocked", text: `Extension ${extension.number} is outside this customer's extensions ${span}.` } };
  }
  return { ok: true, line: { name: "extension", state: "ready", text: `Extension ${extension.number} belongs to this customer and is on the phone system.` } };
}

function trunkCheck(input: CustomerRouteInput): { ok: boolean; line: RouteLine } {
  const span = `${input.spanFrom}–${input.spanTo}`;
  if (input.scope === "timeout") {
    return { ok: false, line: { name: "trunk", state: "unknown", text: "3CX did not answer. This route stays unconfirmed." } };
  }
  if (input.scope === "unknown") {
    return { ok: false, line: { name: "trunk", state: "unknown", text: "This customer's trunk is not confirmed." } };
  }
  if (input.scope === "open") {
    return { ok: false, line: { name: "trunk", state: "blocked", text: `The outbound rule is not limited to this customer's extensions ${span}.` } };
  }
  const trunk = input.trunk;
  if (!trunk || trunk.trunkId <= 0 || trunk.status !== "trunk_live" || input.scope !== "scoped") {
    return { ok: false, line: { name: "trunk", state: "blocked", text: "No trunk is saved for this customer." } };
  }
  return {
    ok: true,
    line: { name: "trunk", state: "ready", text: `Trunk ${trunk.trunkId} is this customer's trunk. It was saved for extensions ${span}.` },
  };
}

function callerCheck(input: CustomerRouteInput): { ok: boolean; callerId: string; line: RouteLine } {
  const live = Boolean(input.trunk && input.trunk.trunkId > 0 && input.trunk.status === "trunk_live");
  const did = live ? normalizeMobile(input.trunk?.did || "") : "";
  const presented = normalizeMobile(input.presentedCallerId);
  if (!live || !did) return { ok: false, callerId: presented, line: { name: "caller_id", state: "blocked", text: "This customer has no confirmed trunk number to present." } };
  if (!presented) return { ok: false, callerId: "", line: { name: "caller_id", state: "blocked", text: "Enter the caller ID as this customer's number." } };
  if (presented !== did) {
    return {
      ok: false,
      callerId: presented,
      line: { name: "caller_id", state: "blocked", text: did ? `Caller ID ${presented} is not this customer's number ${did}.` : "This customer has no number to present as caller ID." },
    };
  }
  return { ok: true, callerId: presented, line: { name: "caller_id", state: "ready", text: `Caller ID ${presented} is this customer's number.` } };
}

function clientIdentity(input: CustomerRouteInput) {
  const client = input.client;
  if (!client) return { ok: false as const, reason: "This customer has no VoIP.ms client account." };
  if (sameAccount(client.account, input.resellerLogin)) {
    return { ok: false as const, reason: "That SIP account is the reseller login. The backup has to use this customer's client account." };
  }
  if (!client.account.trim() || !client.username.trim() || !client.sipHost.trim() || !client.clientId.trim()) {
    return { ok: false as const, reason: "This customer has no VoIP.ms client account." };
  }
  if (client.resellerClient.trim() !== client.clientId.trim()) {
    return { ok: false as const, reason: "The SIP account is not attached to this customer's VoIP.ms client." };
  }
  const who = client.username.trim() === client.account.trim() ? client.account.trim() : `${client.account.trim()} (${client.username.trim()})`;
  return { ok: true as const, reason: `VoIP.ms backup uses this customer's client account ${who} at ${client.sipHost.trim()} for client ${client.clientId.trim()}.` };
}

export function customerRouteVerdict(input: CustomerRouteInput): RouteVerdict {
  const extension = extensionCheck(input);
  const trunk = trunkCheck(input);
  const caller = callerCheck(input);
  const identity = clientIdentity(input);
  const ambiguous = input.scope === "unknown" || input.scope === "timeout";
  const primary = ambiguous ? "unknown" as const : extension.ok && trunk.ok && caller.ok ? "ready" as const : "blocked" as const;
  const backup = ambiguous ? "withheld" as const : identity.ok ? "customer_account" as const : "rejected" as const;
  const backupText = ambiguous
    ? `3CX did not confirm this route. The VoIP.ms backup stays closed so a second call cannot start. ${identity.ok ? `The saved client account is ${input.client?.account.trim()} at ${input.client?.sipHost.trim()}. It was not selected.` : identity.reason}`
    : identity.reason;
  const lines: RouteLine[] = [
    extension.line,
    trunk.line,
    caller.line,
    { name: "backup", state: backup === "customer_account" ? "ready" : backup === "withheld" ? "withheld" : "blocked", text: backupText },
    { name: "idle", state: "ready", text: IDLE_TEXT },
  ];
  return {
    idle: true,
    placeCall: false,
    primary,
    backup,
    path: primary === "ready" ? "customer_3cx" : "none",
    scope: input.scope,
    extensionNumber: input.extension?.number || "",
    trunkId: input.trunk?.trunkId || 0,
    callerId: caller.callerId,
    clientAccount: input.client?.account.trim() || "",
    clientId: input.client?.clientId.trim() || "",
    sipHost: input.client?.sipHost.trim() || "",
    lines,
  };
}
