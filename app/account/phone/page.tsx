import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { addPerson, savePhoneHours } from "../actions";
import { guardAccount } from "@/lib/guard";
import { getDb } from "@/lib/db";
import { extensionCapacity, paidPlan } from "@/lib/pbx";
import { loadSite } from "@/lib/site";

type Extension = { id: number; number: string; first_name: string; last_name: string; email: string; status: string; access_password: string; last_message: string };

export default async function PhonePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const plan = paidPlan(user.id);
  const limit = plan ? extensionCapacity(plan) : 0;
  const rows = getDb().prepare("SELECT id, number, first_name, last_name, email, status, access_password, last_message FROM pbx_extensions WHERE user_id = ? ORDER BY id").all(user.id) as Extension[];
  const hours = getDb().prepare("SELECT open_time, close_time, last_message FROM pbx_departments WHERE user_id = ?").get(user.id) as { open_time: string; close_time: string; last_message: string } | undefined;
  return (
    <Frame pathname="/account/phone">
      <main>
        <AccountHero eyebrow="PHONE SYSTEM" title={text("phoneTitle")} body={text("phoneBody")} />
        <section className="section">
          <div className="wrap">
            <AccountNav pathname="/account/phone" />
            {params.saved ? <p className="form-feedback">{text("phoneSaved")}</p> : null}
            {params.error ? <p className="form-feedback">{params.error}</p> : null}
            {!plan ? <div className="contact-form"><p>{text("phoneClosed")}</p></div> : (
              <>
                <p>{plan.name} includes {limit} {limit === 1 ? "person" : "people"}. {rows.length} added.</p>
                {rows.length < limit ? (
                  <form className="contact-form" action={addPerson}>
                    <div className="form-grid">
                      <label>{text("phoneFirst")} <input name="first_name" required /></label>
                      <label>{text("phoneLast")} <input name="last_name" required /></label>
                    </div>
                    <label>{text("phoneEmail")} <input name="email" type="email" required /></label>
                    <button className="btn btn-primary" type="submit">{text("phoneAdd")}</button>
                  </form>
                ) : <p>{text("phoneLimit")}</p>}
                <form className="contact-form" action={savePhoneHours} style={{ marginTop: 18 }}>
                  <h3>{text("phoneHours")}</h3>
                  <div className="form-grid">
                    <label>{text("phoneOpen")} <input name="open_time" type="time" defaultValue={hours?.open_time || "09:00"} required /></label>
                    <label>{text("phoneClose")} <input name="close_time" type="time" defaultValue={hours?.close_time || "17:00"} required /></label>
                  </div>
                  <button className="btn btn-secondary" type="submit">{text("phoneRoute")}</button>
                  {hours?.last_message ? <p>{hours.last_message}</p> : null}
                </form>
              </>
            )}
            <div className="faq-list" style={{ marginTop: 28 }}>
              {rows.length === 0 ? <p>{text("phoneEmpty")}</p> : null}
              {rows.map((row) => (
                <article key={row.id} className="feature-card" style={{ marginBottom: 12 }}>
                  <h3>Extension {row.number} · {row.first_name} {row.last_name}</h3>
                  <p>{row.email}</p>
                  <p>{row.status === "created" ? "On the phone system" : row.status === "failed" ? "Needs attention" : "Waiting"}{row.last_message ? ` · ${row.last_message}` : ""}</p>
                  {row.status === "created" ? <p>3CX app password: {row.access_password}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
