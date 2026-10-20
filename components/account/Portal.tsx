import Link from "next/link";
import { logout } from "@/app/account/actions";
import { loadSite } from "@/lib/site";
import type { NavLink } from "@/lib/types";

export function AccountNav({ pathname }: { pathname: string }) {
  const links = loadSite().nav.filter((item: NavLink) => item.location === "account");
  return (
    <div className="b-lower-hero" style={{ marginBottom: 28 }}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "text-link" : ""}>{link.label}</Link>
      ))}
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
