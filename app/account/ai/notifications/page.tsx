import Link from "next/link";
import { addRecipientForm, practiceForm, saveCampaignForm } from "./actions";
import { guardAccount } from "@/lib/guard";
import { choiceLine, outcomeLabel, practiceAllowed } from "@/lib/ai-notify";
import { listCampaigns, listPurposes, listRecipients, notificationsActive, recipientBlockers } from "@/lib/ai-notify-store";
import { customerRoute } from "@/lib/ai-route-store";
import { listClips } from "@/lib/ai-audio-store";
import { paidPlan } from "@/lib/pbx";
import { planAllows } from "@/lib/plan-features";

export default async function AccountNotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; outcome?: string }> }) {
  const user = await guardAccount();
  const query = await searchParams;
  if (!planAllows(paidPlan(user.id), "ai_notifications")) {
    return (
      <div className="workspace-page">
        <header className="workspace-page-head">
          <h1>Notifications</h1>
          <p>Automated notifications are not included on this plan. <Link className="text-link" href="/account/ai">Back to AI</Link></p>
        </header>
      </div>
    );
  }
  const active = notificationsActive(user.id);
  const purposes = listPurposes().filter((item) => item.enabled);
  const clips = listClips(user.id).filter((clip) => clip.status === "ready");
  const campaigns = listCampaigns(user.id);
  const recipients = listRecipients(user.id);
  const route = customerRoute(user.id);
  const notice = query.saved === "campaign" ? "Notification saved. No call was placed."
    : query.saved === "person" ? "Person added. No call was placed."
      : query.saved === "practice" ? "Practice result saved. No call was placed."
        : "";
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>Notifications</h1>
        <p>Prepare who would hear a kept message. Press 1 plays it, press 2 declines it, and press 9 stops future notifications. Silence is not a yes. Outbound would use your 3CX extension and trunk, and a VoIP.ms backup would use your client account. Nothing here places a call. <Link className="text-link" href="/account/ai">AI services</Link></p>
      </header>
      <article className="contact-form" id="route">
        <h3>Outbound route</h3>
        {route.lines.map((line) => <p key={line.name}><strong>{line.name === "idle" ? "Idle" : line.state === "ready" ? "Ready" : line.state === "withheld" ? "Closed" : line.state === "unknown" ? "Unconfirmed" : "Needs attention"}.</strong> {line.text}</p>)}
      </article>
      {notice ? <p className="form-feedback">{notice}</p> : null}
      {query.error ? <p className="form-feedback form-error" role="alert">{query.error}</p> : null}
      {!active ? <p>Turn on Automated notifications before preparing one. <Link className="text-link" href="/account/ai">Review AI services</Link></p> : null}
      <form className="contact-form" action={saveCampaignForm}>
        <h3>Notification</h3>
        <label>Name <input name="name" required /></label>
        <label>Business name people will hear <input name="business_name" required /></label>
        <label>Caller ID <input name="caller_id" required placeholder="3345550100" /></label>
        <label>Purpose
          <select name="purpose" required defaultValue="">
            <option value="" disabled>Choose a purpose</option>
            {purposes.map((purpose) => <option key={purpose.code} value={purpose.code}>{purpose.label}</option>)}
          </select>
        </label>
        <label>Kept audio
          <select name="clip_id" required defaultValue="">
            <option value="" disabled>Choose audio</option>
            {clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.title}</option>)}
          </select>
        </label>
        {active && purposes.length > 0 && clips.length > 0 ? <button className="ws-btn primary" type="submit">Save notification</button> : <p>You need an enabled purpose and a kept audio version.</p>}
      </form>
      {campaigns[0] ? <p>{choiceLine(campaigns[0].businessName)}</p> : null}
      {campaigns.length > 0 ? (
        <form className="contact-form" action={addRecipientForm}>
          <h3>Person</h3>
          <label>Notification
            <select name="campaign_id" defaultValue={String(campaigns[0].id)}>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <label>Name <input name="person" /></label>
          <label>Phone number <input name="number" required /></label>
          <label>How they gave permission <textarea name="consent" rows={3} required /></label>
          <button className="ws-btn ghost" type="submit">Add person</button>
        </form>
      ) : null}
      <div className="ai-services">
        {recipients.map((recipient) => {
          const campaign = campaigns.find((item) => item.id === recipient.campaignId);
          const reasons = campaign ? recipientBlockers(user.id, recipient, campaign) : ["That notification is not on this account."];
          const practice = practiceAllowed(reasons) && recipient.phase !== "done";
          return (
            <article className="contact-form" key={recipient.id}>
              <h3>{recipient.personName || recipient.e164}</h3>
              <p>{recipient.e164}</p>
              <p><strong>{reasons.includes("This number opted out.") && recipient.outcome === "pending" ? outcomeLabel("opted_out", false) : outcomeLabel(recipient.outcome, recipient.contentPlayed)}</strong></p>
              {reasons.map((reason) => <p key={reason}>{reason}</p>)}
              {practice && recipient.phase !== "message" ? (
                <div className="ai-practice">
                  {[["1", "Press 1"], ["2", "Press 2"], ["9", "Press 9"], ["silence", "Silence"], ["voicemail", "Voicemail"]].map(([value, label]) => (
                    <form action={practiceForm} key={value}>
                      <input type="hidden" name="id" value={recipient.id} />
                      <input type="hidden" name="event" value={value} />
                      <button className="ws-btn ghost" type="submit">{label}</button>
                    </form>
                  ))}
                </div>
              ) : null}
              {recipient.phase === "message" ? (
                <form action={practiceForm}>
                  <input type="hidden" name="id" value={recipient.id} />
                  <input type="hidden" name="event" value="finished" />
                  <button className="ws-btn primary" type="submit">Message finished</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
