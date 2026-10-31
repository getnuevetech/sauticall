export function numberPurchaseMode(ordering: boolean, automatic: boolean) {
  if (!ordering) return "off" as const;
  return automatic ? "automatic" as const : "manual" as const;
}

function tenDigits(did: string) {
  const digits = did.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(ten) ? ten : "";
}

export function carrierDidRef(did: string) {
  const ten = tenDigits(did);
  return ten ? `voipms:${ten}` : "";
}

export function orderTimedOut(message: string) {
  return /did not answer within/i.test(message);
}

export function orderRecord(result: { ok: boolean; pending?: boolean }, did: string) {
  const placed = Boolean(result.ok || result.pending);
  return { status: placed ? "ordered" as const : "exception" as const, providerRef: placed ? carrierDidRef(did) : "" };
}

export function numberIsBought(status: string, providerRef: string, did: string) {
  const ref = carrierDidRef(did);
  return (status === "ordered" || status === "completed") && Boolean(ref) && providerRef === ref;
}

export function customerLineStatus(status: string) {
  if (status === "trunk_live" || status === "trunk_done") return "Connected for calls";
  if (status === "trunk_waiting") return "Bought. Connecting this number for calls still needs the team.";
  if (status === "not_on_carrier") return "Not on the phone company";
  if (status === "ordered") return "Bought. Connecting this number for calls.";
  return "In progress";
}

export function customerNumberStatus(status: string, providerRef: string, did: string) {
  if (status === "ordered" || status === "completed") return numberIsBought(status, providerRef, did) ? "Bought" : "Needs attention";
  const labels: Record<string, string> = {
    requested: "Saved",
    ordering: "Buying",
    submitted: "Sent",
    exception: "Needs attention",
    cancelled: "Cancelled",
  };
  return labels[status] || "In progress";
}
