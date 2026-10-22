import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { PortForm } from "@/components/account/PortForm";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { loadSite } from "@/lib/site";

export default async function PortingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("porting.requests");
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
    <Frame pathname="/account/porting">
      <main>
        <AccountHero eyebrow="TRANSFER" title={text("portingTitle")} body={text("portingBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/porting" />
            {params.saved ? <p className="form-feedback">{text("portingSaved")}</p> : null}
            {params.error ? <p className="form-feedback">{params.error}</p> : null}
            {open ? <PortForm labels={labels} /> : <div className="contact-form"><p>{text("portingClosed")}</p></div>}
            <div style={{ marginTop: 28 }}>
              {rows.map((row) => {
                const payload = JSON.parse(row.payload) as { numbers?: string };
                return <p key={row.created_at}>{row.status} · {payload.numbers}{row.provider_ref ? ` · ${row.provider_ref}` : ""}{row.staff_note ? ` · ${row.staff_note}` : ""}</p>;
              })}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
