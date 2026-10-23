import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { NumberSearch } from "@/components/account/NumberSearch";
import { saveEmergencyAddress } from "../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { inventoryReady } from "@/lib/carriers";
import { numberPurchaseMode } from "@/lib/number-order";
import { formatAddress, getEmergency, unitTypes, type EmergencyAddress } from "@/lib/e911";
import { loadSite } from "@/lib/site";

const E911: Record<string, string> = {
  missing: "Emergency address missing",
  saved: "Emergency address saved",
  sent: "Emergency address sent to the phone company",
  needs_person: "Emergency address needs a person",
  done: "Emergency address marked done",
};

export default async function NumbersPage({ searchParams }: { searchParams: Promise<{ saved?: string; address?: string; error?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("numbers.search");
  const included = planAllows(paidPlan(user.id), "numbers");
  const address = getEmergency(user.id);
  const rows = getDb().prepare("SELECT id, payload, status, staff_note, created_at FROM account_requests WHERE user_id = ? AND kind = 'number' ORDER BY id DESC").all(user.id) as { id: number; payload: string; status: string; staff_note: string; created_at: string }[];
  const lines = getDb().prepare("SELECT did, e911_status, e911_message FROM phone_lines WHERE user_id = ? ORDER BY id DESC").all(user.id) as { did: string; e911_status: string; e911_message: string }[];
  const labels = Object.fromEntries(["numbersCountryLabel", "numbersStateLabel", "numbersRateLabel", "numbersRatePlaceholder", "numbersSearchLabel", "numbersEmpty", "numbersRequest", "numbersBuy", "numbersLiveOff", "numbersDetailLabel", "numbersDetailPlaceholder"].map((key) => [key, text(key)]));
  const purchase = numberPurchaseMode(flagOn("numbers.live_order"), flagOn("numbers.auto_order"));
  return (
    <Frame pathname="/account/numbers">
      <main>
        <AccountHero eyebrow="NUMBERS" title={text("numbersTitle")} body={text("numbersBody")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/numbers" />
            {params.saved === "ordered" ? <p className="form-feedback">{text("numbersOrdered")}</p> : null}
            {params.saved === "held" ? <p className="form-feedback">{text("numbersHeld")}</p> : null}
            {params.saved === "1" ? <p className="form-feedback">{text("numbersSaved")}</p> : null}
            {params.address ? <p className="form-feedback">{text("e911Saved")}</p> : null}
            {params.error ? <p className="form-feedback">{params.error}</p> : null}
            <form action={saveEmergencyAddress} className="contact-form">
              <h3>{text("e911Title")}</h3>
              <p>{text("e911Body")}</p>
              {address ? <p>{formatAddress(address)}</p> : null}
              <label>{text("e911Name")} <input name="full_name" defaultValue={address?.full_name || user.name} required /></label>
              <div className="form-grid">
                <label>{text("e911StreetNumber")} <input name="street_number" defaultValue={address?.street_number || ""} required /></label>
                <label>{text("e911Street")} <input name="street_name" defaultValue={address?.street_name || ""} required /></label>
              </div>
              <div className="form-grid">
                <label>{text("e911UnitType")}
                  <select name="address_type" defaultValue={address?.address_type || ""}>
                    {unitTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>{text("e911Unit")} <input name="address_number" defaultValue={address?.address_number || ""} /></label>
              </div>
              <div className="form-grid">
                <label>{text("e911City")} <input name="city" defaultValue={address?.city || ""} required /></label>
                <label>{text("e911State")} <input name="state" defaultValue={address?.state || ""} maxLength={2} required /></label>
              </div>
              <div className="form-grid">
                <label>{text("e911Country")}
                  <select name="country" defaultValue={address?.country || "US"}><option value="US">United States</option><option value="CA">Canada</option></select>
                </label>
                <label>{text("e911Zip")} <input name="zip" defaultValue={address?.zip || ""} required /></label>
              </div>
              <label>{text("e911Language")}
                <select name="language" defaultValue={address?.language || "EN"}><option value="EN">English</option><option value="FR">French</option></select>
              </label>
              <button className="btn btn-primary" type="submit">{text("e911Save")}</button>
            </form>
            {!included ? <div className="contact-form"><p>Business numbers are not included on your plan.</p></div> : open ? <NumberSearch live={flagOn("numbers.live_search") && inventoryReady()} automatic={purchase === "automatic"} copy={labels} /> : <div className="contact-form"><p>{text("numbersClosed")}</p></div>}
            <div className="faq-list" style={{ marginTop: 28 }}>
              {lines.map((line) => <p key={line.did}>{line.did} · {E911[line.e911_status] || line.e911_status}{line.e911_message ? ` · ${line.e911_message}` : ""}</p>)}
              {rows.map((row) => {
                const payload = JSON.parse(row.payload) as { did?: string; detail?: string; emergency?: EmergencyAddress };
                const where = payload.emergency ? formatAddress(payload.emergency) : "No emergency address";
                return <p key={row.id}>{row.status} · {payload.did || payload.detail} · {where}{row.staff_note ? ` · ${row.staff_note}` : ""}</p>;
              })}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
