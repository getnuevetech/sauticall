import Link from "next/link";
import { logout } from "@/app/account/actions";
import { currentUser } from "@/lib/auth";
import { extensionCapacity, paidPlan } from "@/lib/pbx";
import { planAllows, type FeatureKey } from "@/lib/plan-features";
import { loadSite } from "@/lib/site";
import type { NavLink } from "@/lib/types";

const ACCOUNT_GATES: Record<string, FeatureKey> = {
  "/account/numbers": "numbers",
  "/account/porting": "porting",
};

export async function AccountNav({ pathname }: { pathname: string }) {
  const user = await currentUser();
  const plan = user?.role === "customer" ? paidPlan(user.id) : null;
  const links = loadSite().nav.filter((item: NavLink) => item.location === "account").filter((link) => {
    if (link.href === "/account/phone") return Boolean(plan && extensionCapacity(plan) > 0);
    const gate = ACCOUNT_GATES[link.href];
    return gate ? planAllows(plan, gate) : true;
  });
  return (
    <div className="b-lower-hero" style={{ marginBottom: 28 }}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "text-link" : ""}>{link.label}</Link>
      ))}
      {planAllows(plan, "ai") ? <Link href="/account/ai" className={pathname === "/account/ai" ? "text-link" : ""}>AI receptionist</Link> : null}
      <form action={logout}><button className="btn btn-secondary" type="submit">Sign out</button></form>
    </div>
  );
}

export function AccountHero({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <section className="inner-hero">
      <div className="wrap">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </section>
  );
}
