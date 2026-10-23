import Link from "next/link";
import { userCan, userPermissions } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listStaffTickets } from "@/lib/tickets";

const START: [string, string, string][] = [
  ["Change the home page", "/admin/content/page.home", "content.home"],
  ["Change plans and prices", "/admin/content/plans", "content.plans"],
  ["Call minutes and trunks", "/admin/lines", "settings.lines"],
  ["Turn features on or off", "/admin/flags", "settings.flags"],
  ["Read messages", "/admin/messages", "inbox.messages"],
  ["Support tickets", "/admin/tickets", "tickets.view"],
  ["FAQ articles", "/admin/faq", "blog.manage"],
  ["Access levels", "/admin/access", "access.manage"],
];

export default async function AdminHome() {
  const user = await currentUser();
  const permissions = user && user.role !== "super_admin" ? userPermissions(user.id) : [];
  const allowed = (key: string) => (user ? userCan(user, key, permissions) : false);
  const counts = {
    messages: allowed("inbox.messages") ? (getDb().prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n : null,
    gateways: allowed("settings.payments") ? (getDb().prepare("SELECT COUNT(*) AS n FROM gateways WHERE enabled = 1").get() as { n: number }).n : null,
    users: allowed("access.manage") ? (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n : null,
    tickets: user && (allowed("tickets.view") || allowed("tickets.view_all") || allowed("tickets.reply"))
      ? listStaffTickets(user).filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed").length
      : null,
  };
  const links = START.filter((item) => allowed(item[2]) || (item[2] === "tickets.view" && (allowed("tickets.reply") || allowed("tickets.view_all"))));
  return (
    <>
      <span className="eyebrow">Admin</span>
      <h1>Welcome{user ? `, ${user.name}` : ""}</h1>
      <p>You only see the parts of admin this account is allowed to open.</p>
      <div className="dash-metrics">
        {counts.users !== null ? <div><small>People</small><b>{counts.users}</b><span>accounts</span></div> : null}
        {counts.gateways !== null ? <div><small>Ways to pay</small><b>{counts.gateways}</b><span>turned on</span></div> : null}
        {counts.messages !== null ? <div><small>Messages</small><b>{counts.messages}</b><span>from the site</span></div> : null}
        {counts.tickets !== null ? <div><small>Open tickets</small><b>{counts.tickets}</b><span>not resolved</span></div> : null}
      </div>
      {links.length ? (
        <>
          <h3 style={{ marginTop: 28 }}>Your pages</h3>
          <div className="admin-start">
            {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          </div>
        </>
      ) : <p>An administrator has not given this account access to any admin page yet.</p>}
    </>
  );
}
