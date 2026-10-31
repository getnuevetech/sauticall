import Link from "next/link";
import { notFound } from "next/navigation";
import { fundPaidClient, provisionVoipClient, saveCustomerUser } from "../../desk-actions";
import { CopyButton } from "@/components/admin/CopyButton";
import { userCan, requirePermission } from "@/lib/access";
import { customerRoute } from "@/lib/ai-route-store";
import { clientMailbox } from "@/lib/customer-code";
import { customerSnapshot } from "@/lib/customer-desk";
import { flagOn, getDb } from "@/lib/db";
import { ago } from "@/lib/failure-desk";
import { formatDay, formatWhen } from "@/lib/format-when";
import { bestTrunk, outboundChoice } from "@/lib/outbound-path";
import { formatDid, lineStatusLabel } from "@/lib/phone-ops-view";
import { trunkAttemptLabel } from "@/lib/trunk-tries";
import { recordingPublic } from "@/lib/recording-store";
import { systemsForPlan } from "@/lib/ai-account";
import { aiSettingsFor, listAiExtensions } from "@/lib/ai-account-store";
import { paidPlan } from "@/lib/pbx";

const TABS = [
  ["overview", "Overview"],
  ["profile", "Profile"],
  ["billing", "Billing"],
  ["phone", "Phone system"],
  ["ai", "AI"],
  ["support", "Support"],
  ["activity", "Activity"],
  ["security", "Security"],
] as const;

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; tab?: string }> }) {
  const actor = await requirePermission("users.customers");
  const { id } = await params;
  const query = await searchParams;
  const account = customerSnapshot(Number(id));
  if (!account) notFound();
  const tab = TABS.some((item) => item[0] === query.tab) ? query.tab || "overview" : "overview";
  const globalMfa = flagOn("auth.mfa");
  const route = outboundChoice({
    trunk: bestTrunk(account.lines.map((line) => ({ status: line.status, trunkId: line.trunk_id }))),
    backupEnabled: flagOn("pbx.voipms_backup"),
    customerClient: Boolean(account.client?.client_id),
  });
  const checked = customerRoute(account.id);
  const trunkIssue = account.lines.length > 0 && account.liveTrunks < account.lines.length || account.openTrunks > 0;
  const issueCount = (account.lines.length - account.liveTrunks) + account.openTrunks;
  const seeTickets = userCan(actor, "tickets.view") || userCan(actor, "tickets.view_all") || userCan(actor, "tickets.reply");
  const recordings = recordingPublic();
  const customerPlan = paidPlan(account.id);
  const aiSystems = systemsForPlan(customerPlan?.features || []);
  const aiExtensions = listAiExtensions(account.id);
  const mailbox = clientMailbox(account.code);
  const latestSms = getDb().prepare("SELECT status, detail, created_at FROM sms_outbox WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(account.id) as { status: string; detail: string; created_at: string } | undefined;
  const failures = getDb().prepare("SELECT id, area, subject, detail, created_at FROM failure_log WHERE user_id = ? ORDER BY id DESC LIMIT 8").all(account.id) as { id: number; area: string; subject: string; detail: string; created_at: string }[];
  const payments = getDb().prepare("SELECT id, amount_cents, currency, status, plan_name, created_at FROM payment_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(account.id) as { id: number; amount_cents: number; currency: string; status: string; plan_name: string; created_at: string }[];
  return (
    <div className="ops ops-single">
      <div>
        <div className="acct-head">
          <div>
            <div className="acct-title">
              <h1>{account.company}</h1>
              <CopyButton value={account.code} label="Copy customer ID" />
            </div>
            <p className="acct-meta">Customer ID {account.code} · Joined {formatDay(account.joined)}</p>
          </div>
          <Link className="btn btn-secondary" href={`/admin/customers/${account.id}?tab=profile`}>Edit profile</Link>
        </div>
        {query.error ? <p className="ops-alert">{query.error}</p> : null}
        {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
        <nav className="ops-tabs acct-tabs" aria-label="Customer">
          {TABS.map(([key, label]) => (
            <Link key={key} href={`/admin/customers/${account.id}?tab=${key}`} data-current={tab === key ? "true" : undefined}>{label}</Link>
          ))}
        </nav>

        {tab === "overview" ? (
          <>
            <div className="acct-split">
              <section className="ops-card">
                <h2>Contact & account</h2>
                <div className="acct-split" style={{ marginTop: 8 }}>
                  <dl className="acct-kv">
                    <dt>Primary contact</dt><dd>{account.contact}</dd>
                    <dt>Company</dt><dd>{account.company}</dd>
                    <dt>Email</dt><dd>{account.email}{account.emailVerified ? <span className="ops-verified">Verified</span> : null}</dd>
                    <dt>Mobile</dt><dd>{account.phoneLabel || "Not provided"}{account.phoneVerified ? <span className="ops-verified">Verified</span> : null}</dd>
                    <dt>Secondary phone</dt><dd>Not provided</dd>
                  </dl>
                  <dl className="acct-kv">
                    <dt>Contact address</dt>
                    <dd>{account.addressLines.length ? account.addressLines.map((line) => <span key={line}>{line}<br /></span>) : "Not provided"}</dd>
                    <dt>Billing address</dt>
                    <dd>Not provided<br /><Link href={`/admin/customers/${account.id}?tab=billing`}>Open billing</Link></dd>
                  </dl>
                </div>
                <p className="ops-muted">Contact address is separate from per-number emergency addresses.</p>
              </section>
              <aside className="ops-card acct-summary">
                <h2>Account summary</h2>
                <p><span>Plan</span><strong>{account.plan}</strong></p>
                <p><span>Sign-in</span><strong>{account.disabled ? "Disabled" : "Enabled"}</strong></p>
                <p><span>MFA policy</span><strong>Account requirement: {account.mfaRequired ? "On" : "Off"}</strong></p>
                <p><span>Global policy</span><strong>{globalMfa ? "On" : "Off"}</strong></p>
                <p><span>Enrollment</span><strong>{account.emailVerified ? "Email confirmed" : "Not confirmed"}</strong></p>
                <p><Link href={`/admin/customers/${account.id}?tab=security`}>Security settings →</Link></p>
              </aside>
            </div>
            <h2 style={{ marginTop: 18 }}>Services</h2>
            <div className="acct-services">
              <article className="acct-service"><span>Business numbers</span><b>{account.numbers}</b><Link href={`/admin/customers/${account.id}?tab=phone`}>View numbers →</Link></article>
              <article className="acct-service"><span>Extensions</span><b>{account.allowance ? `${account.extensions} of ${account.allowance}` : account.extensions}</b><Link href={`/admin/customers/${account.id}?tab=phone`}>View extensions →</Link></article>
              <article className="acct-service"><span>Trunks</span><b>{account.lines.length}</b>{trunkIssue ? <span className="ops-badge warn">Needs attention</span> : null}<div><Link href={`/admin/lines?company=${account.id}`}>View trunks →</Link></div></article>
              <article className="acct-service"><span>Open tickets</span><b>{account.tickets}</b><Link href={`/admin/customers/${account.id}?tab=support`}>View tickets →</Link></article>
            </div>
            {trunkIssue ? (
              <div className="acct-alert">
                <div>
                  <strong>{Math.max(issueCount, 1)} provisioning issue{issueCount === 1 ? "" : "s"}</strong>
                  <p>A trunk is not fully provisioned. This may affect call routing.</p>
                </div>
                <Link className="btn btn-secondary" href={`/admin/lines?company=${account.id}`}>View issue</Link>
              </div>
            ) : null}
            <details className="ops-card" open>
              <summary>Provider mappings</summary>
              <p className="ops-muted">Provider-specific identifiers for this customer.</p>
              <div className="acct-chips">
                <span>VoIP.ms client {account.client?.client_id || "Not linked"}</span>
                <span>Line account {account.lineAccount || "Not linked"}</span>
                <span>3CX trunks {account.lines.filter((line) => line.trunk_id > 0).map((line) => line.trunk_id).join(", ") || "None"}</span>
              </div>
            </details>
          </>
        ) : null}

        {tab === "profile" ? (
          <section className="ops-card">
            <h2>Profile</h2>
            <form className="ops-stack" action={saveCustomerUser}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="tab" value="profile" />
              {account.disabled ? <input type="hidden" name="disabled" value="on" /> : null}
              {account.mfaRequired ? <input type="hidden" name="mfa_required" value="on" /> : null}
              <label>Name <input name="name" defaultValue={account.contact} required /></label>
              <label>Email <input name="email" type="email" defaultValue={account.email} required /></label>
              <label>New password <input name="password" type="password" minLength={10} placeholder="Leave blank to keep the current password" /></label>
              <p className="ops-muted">Company on the phone system is {account.company}. Mobile is {account.phoneLabel || "not saved"}.</p>
              <button className="btn btn-primary" type="submit">Save profile</button>
            </form>
          </section>
        ) : null}

        {tab === "billing" ? (
          <section className="ops-card">
            <h2>Billing</h2>
            <p>Plan {account.plan}.</p>
            {account.client?.funded_cents ? <p>Phone-company balance ${account.client.funded_cents / 100} for {account.client.funded_plan}.</p> : <p>{flagOn("billing.fund_client") ? "No phone-company balance yet. It is added after a plan payment is confirmed." : "Funding client accounts is turned off."}</p>}
            {payments.length === 0 ? <p>No payments are stored.</p> : (
              <ul className="desk-lines">{payments.map((payment) => <li key={payment.id}>{payment.plan_name || "Payment"} · ${(payment.amount_cents / 100).toFixed(2)} {payment.currency} · {payment.status} · {formatWhen(payment.created_at)}</li>)}</ul>
            )}
            <p>VoIP.ms is given {mailbox || "the customer ID at sauticall.com"}, not this customer's inbox.</p>
            {account.client?.last_message ? <p>{account.client.last_message}</p> : null}
            <form action={provisionVoipClient}><input type="hidden" name="id" value={account.id} /><button className="btn btn-secondary" type="submit">{account.client?.client_id ? "Refresh the VoIP.ms client" : "Create the VoIP.ms client"}</button></form>
            {flagOn("billing.fund_client") && account.plan !== "No paid plan" && !account.client?.funded_cents ? (
              <form action={fundPaidClient}><input type="hidden" name="id" value={account.id} /><button className="btn btn-secondary" type="submit">Add the plan balance</button></form>
            ) : null}
          </section>
        ) : null}

        {tab === "phone" ? (
          <section className="ops-card">
            <h2>Phone system</h2>
            <p>{route.reason}</p>
            <p>{flagOn("pbx.voipms_backup") ? "VoIP.ms backup is on. It uses this customer's client only after 3CX confirms the trunk failed. No call is placed from this page." : "VoIP.ms backup is off. Only an administrator can turn it on in Platform controls. No call is placed from this page."}</p>
            <ul className="ops-steps">
              {checked.lines.map((line) => <li key={line.name}><span className={line.state === "ready" ? "ok" : line.state === "blocked" ? "bad" : "muted"} /> {line.text}</li>)}
            </ul>
            <p className="ops-muted">Primary is this customer's 3CX extension and trunk. Backup is this customer's VoIP.ms client. The check reads numbers already stored here.</p>
            <h3>Extensions</h3>
            {account.people.length === 0 ? <p>No extensions yet.</p> : (
              <ul className="desk-lines">{account.people.map((item) => <li key={`${item.status}-${item.former_number || item.number}`}>{item.status === "removed" && item.former_number ? item.former_number : item.number} · {item.first_name} {item.last_name} · {item.email} · {item.status}</li>)}</ul>
            )}
            <h3>Numbers</h3>
            {account.lines.length === 0 ? <p>No purchased numbers.</p> : (
              <ul className="desk-lines">{account.lines.map((line) => <li key={line.did}>{formatDid(line.did)} · {lineStatusLabel(line.status)} · {trunkAttemptLabel({ status: line.status, trunkId: line.trunk_id, attempts: line.trunk_attempts })}</li>)}</ul>
            )}
            <p><Link href={`/admin/lines?company=${account.id}`}>Open this customer's lines and trunks</Link></p>
            <p>Recorded messages: {recordings.provider === "off" ? "storage is off." : `${recordings.provider === "aws" ? "Amazon S3" : "Google Cloud Storage"} bucket ${recordings.bucket}.`}</p>
          </section>
        ) : null}

        {tab === "ai" ? (
          <section className="ops-card">
            <h2>AI for this account</h2>
            <p>{customerPlan ? `${customerPlan.name} includes ${aiSystems.filter((item) => item.included).length} of ${aiSystems.length} AI systems.` : "This account has no paid plan, so no AI system is included."} Each system is turned on for a plan in Plans. This page does not place a call, and live calls stay off until the phone-system connection is verified.</p>
            {aiSystems.map((system) => {
              const settings = aiSettingsFor(account.id, system.code);
              const assigned = aiExtensions.find((item) => item.ai_role === system.code);
              return (
                <article key={system.code}>
                  <h3>{system.label}</h3>
                  <p>{system.included ? "Included on this plan." : "Not included on this plan."}</p>
                  <p>{settings?.display_name ? `Name ${settings.display_name}.` : "No name saved."} {assigned ? `Extension ${assigned.number} is the AI extension.` : "No AI extension is assigned."}</p>
                  {settings?.greeting ? <p>{settings.greeting}</p> : null}
                </article>
              );
            })}
            <h3>Extensions</h3>
            {aiExtensions.length === 0 ? <p>No extensions yet. The customer chooses an AI extension while adding a person.</p> : (
              <ul className="desk-lines">{aiExtensions.map((item) => <li key={item.id}>{item.number} · {item.first_name} {item.last_name} · {item.ai_role ? `${item.ai_name || "AI"} (${item.ai_role})` : "Ordinary extension"}</li>)}</ul>
            )}
          </section>
        ) : null}

        {tab === "support" ? (
          <section className="ops-card">
            <h2>Support</h2>
            <p>{account.tickets} open ticket{account.tickets === 1 ? "" : "s"}.</p>
            {seeTickets ? <p><Link href={`/admin/tickets?q=${encodeURIComponent(account.email)}`}>Open this customer's tickets</Link></p> : <p>You do not have ticket access.</p>}
          </section>
        ) : null}

        {tab === "activity" ? (
          <section className="ops-card">
            <h2>Activity</h2>
            {latestSms ? <p>Last text {latestSms.status} {ago(latestSms.created_at)}{latestSms.detail ? `: ${latestSms.detail}` : "."}</p> : <p>No text message is stored.</p>}
            {failures.length === 0 ? <p>No failed requests for this customer.</p> : (
              <ul className="desk-lines">{failures.map((row) => <li key={row.id}><Link href={`/admin/failures?failure=${row.id}`}>{row.area}</Link> · {row.subject} · {ago(row.created_at)}</li>)}</ul>
            )}
          </section>
        ) : null}

        {tab === "security" ? (
          <section className="ops-card">
            <h2>Security</h2>
            <p>Email {account.emailVerified ? "confirmed" : "not confirmed yet"}.</p>
            <p>Mobile {account.phoneLabel ? `${account.phoneLabel}, ${account.phoneVerified ? "confirmed" : "not confirmed yet"}` : "not saved"}.</p>
            <p>Global authenticator policy is {globalMfa ? "on for every account" : "off"}.</p>
            <form className="ops-stack" action={saveCustomerUser}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="tab" value="security" />
              <input type="hidden" name="name" value={account.contact} />
              <input type="hidden" name="email" value={account.email} />
              <label className="check-option"><input type="checkbox" name="disabled" defaultChecked={account.disabled} /> Turn off sign-in</label>
              <label className="check-option"><input type="checkbox" name="mfa_required" defaultChecked={account.mfaRequired} /> Require an authenticator for this account</label>
              <button className="btn btn-primary" type="submit">Save security</button>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
