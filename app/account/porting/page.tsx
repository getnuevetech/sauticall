import { redirect } from "next/navigation";
import { PortForm } from "@/components/account/PortForm";
import { PLAN_SETUP_PATH } from "@/lib/account-start";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";
import { customerMessage, customerRequestStatus } from "@/lib/customer-message";
import { loadSite } from "@/lib/site";

export default async function PortingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  if (!paidPlan(user.id)) redirect(PLAN_SETUP_PATH);
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("porting.requests");
  const included = planAllows(paidPlan(user.id), "porting");
  const rows = getDb().prepare("SELECT payload, status, provider_ref, staff_note, created_at FROM account_requests WHERE user_id = ? AND kind = 'port' ORDER BY id DESC").all(user.id) as { payload: string; status: string; provider_ref: string; staff_note: string; created_at: string }[];
  const labels = {
    number: text("portNumberLabel"),
    country: text("portCountryLabel"),
    first: text("portFirstLabel"),
    last: text("portLastLabel"),
    business: text("portBusinessLabel"),
    address: text("portAddressLabel"),
    city: text("portCityLabel"),
    state: text("portStateLabel"),
    zip: text("portZipLabel"),
    carrier: text("portCarrierLabel"),
    account: text("portAccountLabel"),
    pin: text("portPinLabel"),
    submit: text("portSubmit"),
  };
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>{text("portingTitle")}</h1>
        <p>{text("portingBody")}</p>
      </header>
            {params.saved ? <p className="form-feedback">{text("portingSaved")}</p> : null}
            {params.error ? <p className="form-feedback form-error" role="alert">{customerMessage(params.error, "Something went wrong. Please try again, or contact support.")}</p> : null}
            {!included ? <div className="contact-form"><p>Number transfer is not included on your plan.</p></div> : open ? <PortForm labels={labels} /> : <div className="contact-form"><p>{text("portingClosed")}</p></div>}
            <div style={{ marginTop: 28 }}>
              {rows.map((row) => {
                const payload = JSON.parse(row.payload) as { numbers?: string };
                const reference = /^[A-Za-z0-9._:-]{1,40}$/.test(row.provider_ref) ? ` · Reference ${row.provider_ref}` : "";
                return <p key={row.created_at}>{customerRequestStatus(row.status)} · {payload.numbers}{reference}</p>;
              })}
            </div>
    </div>
  );
}
