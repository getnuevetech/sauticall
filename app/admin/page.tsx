import Link from "next/link";
import { ChartGrid, KpiRow } from "@/components/admin/Charts";
import { currentUser } from "@/lib/auth";
import { dashboardFor } from "@/lib/dashboard";

export default async function AdminHome() {
  const user = await currentUser();
  if (!user) return null;
  const board = dashboardFor(user);
  return (
    <div className="dash-board">
      <div>
        <span className="eyebrow">Admin</span>
        <h1>Dashboard</h1>
        <p>Live counts for the parts of SautiCall this account can see. Open a chart to work on that area.</p>
      </div>
      <KpiRow items={board.kpis} />
      {board.attention.length ? (
        <section className="dash-card dash-wide">
          <h3>Needs a look</h3>
          <ul className="dash-attention">
            {board.attention.map((item) => (
              <li key={item.href + item.title}><Link href={item.href}>{item.title}</Link><span>{item.detail}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      {board.cards.length ? <ChartGrid cards={board.cards} /> : <p>An administrator has not given this account access to any admin page yet.</p>}
    </div>
  );
}
