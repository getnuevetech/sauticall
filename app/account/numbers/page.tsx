import { PhoneNumbers } from "@/components/account/PhoneNumbers";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { publishBoughtNumbers, scheduleAutomaticTrunks } from "@/lib/lines";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { inventoryReady } from "@/lib/carriers";
import { customerNumberStatus } from "@/lib/number-order";
import { customerTrunkStatus } from "@/lib/trunk-tries";
import { formatAddress, getEmergency, type EmergencyAddress } from "@/lib/e911";
import { placesConfigured } from "@/lib/google-places";
import { customerMessage } from "@/lib/customer-message";
import { loadSite } from "@/lib/site";

const E911: Record<string, string> = {
  missing: "Add an emergency address.",
  needs_person: "The phone company did not accept this address.",
};

export default async function NumbersPage({ searchParams }: { searchParams: Promise<{ saved?: string; address?: string; error?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("numbers.search");
  const included = planAllows(paidPlan(user.id), "numbers");
  const address = getEmergency(user.id);
  publishBoughtNumbers(user.id);
  scheduleAutomaticTrunks(user.id);
  const verified = getDb().prepare("SELECT phone_verified_at FROM users WHERE id = ?").get(user.id) as { phone_verified_at: string } | undefined;
  const smsRequired = flagOn("auth.verify_sms");
  const rows = getDb().prepare("SELECT id, payload, status, provider_ref, created_at FROM account_requests WHERE user_id = ? AND kind = 'number' ORDER BY id DESC").all(user.id) as { id: number; payload: string; status: string; provider_ref: string; created_at: string }[];
  const lines = getDb().prepare("SELECT did, status, trunk_id, trunk_attempts, trunk_routes, e911_status FROM phone_lines WHERE user_id = ? ORDER BY id DESC").all(user.id) as { did: string; status: string; trunk_id: number; trunk_attempts: number; trunk_routes: number; e911_status: string }[];
  const notice = params.error
    ? customerMessage(params.error, "Something went wrong. Please try again, or contact support.")
    : params.saved === "ordered"
      ? text("numbersOrdered")
      : params.saved === "pending"
        ? "The order was sent. This number stays unmarked until the phone company lists it."
        : params.saved === "held"
          ? text("numbersHeld")
          : params.saved === "ordering"
            ? "Your trunk will be ready in a few minutes."
          : params.saved === "1"
            ? text("numbersSaved")
            : params.address
              ? text("e911Saved")
              : "";
  return (
    <PhoneNumbers
      initialTab={params.saved ? "mine" : "find"}
      phoneVerified={!smsRequired || Boolean(verified?.phone_verified_at)}
      noticeError={Boolean(params.error)}
      live={open && flagOn("numbers.live_search") && inventoryReady()}
      included={included}
      closed={!open}
      hasAddress={Boolean(address)}
      addressLine={address ? formatAddress(address) : ""}
      defaults={{
        full_name: address?.full_name || user.name,
        street_number: address?.street_number || "",
        street_name: address?.street_name || "",
        address_type: address?.address_type || "",
        address_number: address?.address_number || "",
        city: address?.city || "",
        state: address?.state || "",
        country: address?.country || "US",
        zip: address?.zip || "",
      }}
      lookup={placesConfigured()}
      owned={lines.map((line) => ({ did: line.did, status: customerTrunkStatus({ status: line.status, trunkId: line.trunk_id, attempts: line.trunk_attempts, routes: line.trunk_routes === 1 }), detail: line.status === "not_on_carrier" ? "" : E911[line.e911_status] || "" }))}
      requests={rows.map((row) => {
        let payload: { did?: string; detail?: string; emergency?: EmergencyAddress } = {};
        try {
          payload = JSON.parse(row.payload) as { did?: string; detail?: string; emergency?: EmergencyAddress };
        } catch {
          payload = {};
        }
        return {
          id: row.id,
          did: payload.did || "",
          status: customerNumberStatus(row.status, row.provider_ref, payload.did || ""),
          where: payload.emergency ? formatAddress(payload.emergency) : payload.detail || "No emergency address",
        };
      })}
      notice={notice}
    />
  );
}
