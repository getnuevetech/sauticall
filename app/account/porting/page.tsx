import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { AuthForm } from "@/components/account/AuthForm";
import { savePort } from "../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { loadSite } from "@/lib/site";

export default async function PortingPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("porting.requests");
  const rows = getDb().prepare("SELECT payload, status, created_at FROM account_requests WHERE user_id = ? AND kind = 'port' ORDER BY id DESC").all(user.id) as { payload: string; status: string; created_at: string }[];
  return (
    <Frame pathname="/account/porting">
      <main>
        <AccountHero eyebrow="TRANSFER" title={text("portingTitle")} body={text("portingBody")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/porting" />
            {params.saved ? <p className="form-feedback">Transfer request saved.</p> : null}
            {open ? <AuthForm action={savePort} submit="Save transfer request" fields={[{ name: "detail", label: "Number to transfer", placeholder: "555-0100" }]} /> : <div className="contact-form"><p>{text("portingClosed")}</p></div>}
            <div style={{ marginTop: 28 }}>{rows.map((row) => <p key={row.created_at}>{row.status} · {row.payload}</p>)}</div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
