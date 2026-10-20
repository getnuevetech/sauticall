import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { AuthForm } from "@/components/account/AuthForm";
import { saveNumber } from "../actions";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { loadSite } from "@/lib/site";

export default async function NumbersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("numbers.search");
  const rows = getDb().prepare("SELECT payload, status, created_at FROM account_requests WHERE user_id = ? AND kind = 'number' ORDER BY id DESC").all(user.id) as { payload: string; status: string; created_at: string }[];
  return (
    <Frame pathname="/account/numbers">
      <main>
        <AccountHero eyebrow="NUMBERS" title={text("numbersTitle")} body={text("numbersBody")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/numbers" />
            {params.saved ? <p className="form-feedback">Request saved.</p> : null}
            {open ? <AuthForm action={saveNumber} submit="Save number request" fields={[{ name: "detail", label: "Area or number you want", placeholder: "Houston local number" }]} /> : <div className="contact-form"><p>{text("numbersClosed")}</p></div>}
            <div className="faq-list" style={{ marginTop: 28 }}>
              {rows.map((row) => <p key={row.created_at}>{row.status} · {row.payload}</p>)}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
