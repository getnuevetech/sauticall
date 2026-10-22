import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { NumberSearch } from "@/components/account/NumberSearch";
import { guardAccount } from "@/lib/guard";
import { flagOn, getDb } from "@/lib/db";
import { loadSite } from "@/lib/site";

export default async function NumbersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("numbers.search");
  const rows = getDb().prepare("SELECT payload, status, staff_note, created_at FROM account_requests WHERE user_id = ? AND kind = 'number' ORDER BY id DESC").all(user.id) as { payload: string; status: string; staff_note: string; created_at: string }[];
  const labels = Object.fromEntries(["numbersCountryLabel", "numbersStateLabel", "numbersRateLabel", "numbersRatePlaceholder", "numbersSearchLabel", "numbersEmpty", "numbersRequest", "numbersLiveOff", "numbersDetailLabel", "numbersDetailPlaceholder"].map((key) => [key, text(key)]));
  return (
    <Frame pathname="/account/numbers">
      <main>
        <AccountHero eyebrow="NUMBERS" title={text("numbersTitle")} body={text("numbersBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/numbers" />
            {params.saved ? <p className="form-feedback">{text("numbersSaved")}</p> : null}
            {params.error ? <p className="form-feedback">{params.error}</p> : null}
            {open ? <NumberSearch live={flagOn("numbers.live_search")} copy={labels} /> : <div className="contact-form"><p>{text("numbersClosed")}</p></div>}
            <div className="faq-list" style={{ marginTop: 28 }}>
              {rows.map((row) => {
                const payload = JSON.parse(row.payload) as { did?: string; detail?: string };
                return <p key={row.created_at}>{row.status} · {payload.did || payload.detail}{row.staff_note ? ` · ${row.staff_note}` : ""}</p>;
              })}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
