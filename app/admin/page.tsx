import { getDb } from "@/lib/db";

export default function AdminHome() {
  const counts = {
    messages: (getDb().prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
    gateways: (getDb().prepare("SELECT COUNT(*) AS n FROM gateways WHERE enabled = 1").get() as { n: number }).n,
    users: (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
  };
  return (
    <>
      <span className="eyebrow">ADMIN</span>
      <h1>Control the site</h1>
      <p>Copy, navigation, plans, fonts, colors, images, feature switches, and payment gateways are stored here. Changing them does not require a code deploy.</p>
      <div className="dash-metrics">
        <div><small>People</small><b>{counts.users}</b><span>accounts</span></div>
        <div><small>Enabled gateways</small><b>{counts.gateways}</b><span>ready for checkout</span></div>
        <div><small>Messages</small><b>{counts.messages}</b><span>from the contact form</span></div>
      </div>
    </>
  );
}
