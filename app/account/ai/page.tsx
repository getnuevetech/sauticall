import Link from "next/link";
import { saveAiReceptionist } from "@/app/account/ai/actions";
import { guardAccount } from "@/lib/guard";
import { receptionistView } from "@/lib/ai-receptionist";
import { customerMessage } from "@/lib/customer-message";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

export default async function AccountAiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await guardAccount();
  const params = await searchParams;
  const plan = paidPlan(user.id);
  const included = planAllows(plan, "ai");
  const view = included ? receptionistView(user.id) : null;
  const saved = params.saved ? "The receptionist was saved from the company details on this account." : "";
  const error = params.error ? customerMessage(params.error, "The receptionist could not be saved. Please try again, or contact support.") : "";
  const status = view?.onPhoneSystem ? "On the phone system" : view?.status === "failed" ? "Needs attention" : view?.status === "saved" ? "Saved on this account" : "Not on the phone system yet";
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>AI receptionist</h1>
        <p>{included ? "This is turned on for the plan you subscribed to." : "This stays off until your plan includes it."}</p>
      </header>
      {saved ? <p className="form-feedback">{saved}</p> : null}
      {error ? <p className="form-feedback">{error}</p> : null}
      {view ? (
        <section className="ws-card ai-card">
          <div className="ws-split">
            <h2>{plan?.name} includes the AI receptionist</h2>
            <span className={`pbx-status ${view.onPhoneSystem ? "ok" : view.status === "failed" ? "warn" : "wait"}`}>{status}</span>
          </div>
          <p>{view.facts.anyLanguage ? "Callers can speak any language. The receptionist follows what they say and routes the call." : "The receptionist answers in English."}</p>
          <p>Saving reads the company name, hours, address, numbers, people, and groups already stored for this account, then writes that account&apos;s receptionist and its prompt on the phone system.</p>
          <div className="ai-facts">
            <div><span>Company</span><b>{view.facts.company || "Add a company name"}</b></div>
            <div><span>Hours</span><b>{view.facts.open && view.facts.close ? `${view.facts.open} to ${view.facts.close}` : "Not set"}</b></div>
            <div><span>Address</span><b>{view.facts.address || "Not set"}</b></div>
            <div><span>Numbers</span><b>{view.facts.numbers.length ? view.facts.numbers.join(", ") : "None yet"}</b></div>
            <div><span>People</span><b>{view.facts.people.length ? view.facts.people.map((person) => person.name).join(", ") : "None yet"}</b></div>
            <div><span>Groups</span><b>{view.facts.groups.length ? view.facts.groups.map((group) => group.name).join(", ") : "None yet"}</b></div>
          </div>
          {view.script.greeting ? <p className="ai-script">{`${view.script.greeting}\n\n${view.script.prompt}`}</p> : <p>{view.script.missing} <Link className="text-link" href="/account/security?tab=business">Business profile</Link></p>}
          {view.message && !error ? <p>{customerMessage(view.message, "")}</p> : null}
          <form action={saveAiReceptionist}>
            <label>
              Anything else the receptionist should know
              <textarea name="extra" maxLength={1500} defaultValue={view.facts.extra} placeholder="Ask whether the caller needs sales or support." />
            </label>
            <label className="num-terms">
              <input type="checkbox" name="answer" value="on" defaultChecked={view.enabled} />
              <span>Answer this company&apos;s calls during open hours. After hours, calls still go to voicemail.</span>
            </label>
            <button className="ws-btn primary" type="submit" disabled={!view.facts.company}>Save receptionist</button>
          </form>
          <p>Save again after you add people, groups, hours, or a number. The prompt is rebuilt from those records each time.</p>
        </section>
      ) : (
        <section className="ws-card">
          <h3>AI receptionist is not included{plan ? ` on ${plan.name}` : ""}</h3>
          <p>An administrator has to check AI receptionist on your plan before this account can use it.</p>
          <p><Link className="text-link" href="/account/billing/plan">See plans</Link></p>
        </section>
      )}
    </div>
  );
}
