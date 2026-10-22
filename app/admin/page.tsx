import Link from "next/link";
import { getDb } from "@/lib/db";

const START = [
  ["Change the home page", "/admin/content/page.home"],
  ["Change plans and prices", "/admin/content/plans"],
  ["Call minutes and trunks", "/admin/lines"],
  ["Turn features on or off", "/admin/flags"],
  ["Read messages", "/admin/messages"],
];

export default function AdminHome() {
  const counts = {
    messages: (getDb().prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
    gateways: (getDb().prepare("SELECT COUNT(*) AS n FROM gateways WHERE enabled = 1").get() as { n: number }).n,
    users: (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
  };
  return (
    <>
      <span className="eyebrow">Admin</span>
      <h1>Welcome</h1>
      <p>Change the words, prices, colors, and what customers can do. You do not need a developer for any of this.</p>
      <div className="dash-metrics">
        <div><small>People</small><b>{counts.users}</b><span>accounts</span></div>
        <div><small>Ways to pay</small><b>{counts.gateways}</b><span>turned on</span></div>
        <div><small>Messages</small><b>{counts.messages}</b><span>from the site</span></div>
      </div>
      <h3 style={{ marginTop: 28 }}>Start here</h3>
      <div className="admin-start">
        {START.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      </div>
    </>
  );
}
