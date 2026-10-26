import Link from "next/link";
import { logout } from "@/app/account/actions";
import { Icon } from "../Icon";
import { MenuButton } from "./Interactive";
import type { NavLink, Theme } from "@/lib/types";

function Brand({ theme, href = "/" }: { theme: Theme; href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="SautiCall home">
      {theme.logoUrl ? (
        // Admin-managed logo replaces the drawn mark when a file is set.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.logoUrl} alt="" style={{ height: 37, width: "auto" }} />
      ) : (
        <span className="brand-mark"><span className="mark-wave" /><span className="mark-wave" /><span className="mark-wave" /></span>
      )}
      <span>Sauti<span className="brand-accent">Call</span></span>
    </Link>
  );
}

function SignOut({ className }: { className: string }) {
  return (
    <form action={logout}>
      <button className={className} type="submit">Sign out</button>
    </form>
  );
}

export function SiteHeader({
  nav,
  theme,
  pathname,
  showSignIn,
  signedIn,
  accountHref,
  accountLabel,
  talkLabel,
  talkHref,
}: {
  nav: NavLink[];
  theme: Theme;
  pathname: string;
  showSignIn: boolean;
  signedIn: boolean;
  accountHref: string;
  accountLabel: string;
  talkLabel: string;
  talkHref: string;
}) {
  const header = nav.filter((item) => item.location === "header");
  const mobile = nav.filter((item) => item.location === "mobile");
  return (
    <header className="site-header">
      <div className="wrap nav-inner">
        <Brand theme={theme} />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {header.map((item) => item.href === "/solutions" ? (
            <span className="nav-drop" key={item.href + item.label}>
              <Link className={pathname === item.href ? "active" : ""} href={item.href}>{item.label} <Icon name="arrowdown" size={14} /></Link>
              <span className="nav-drop-menu">
                <Link href="/solutions#phone">Phone system</Link>
                <Link href="/solutions#phones">Desk & mobile</Link>
                <Link href="/ai-receptionist">AI receptionist</Link>
                <Link href="/solutions#center">Contact center</Link>
                <Link href="/solutions#numbers">Numbers & porting</Link>
              </span>
            </span>
          ) : (
            <Link key={item.href + item.label} className={pathname === item.href ? "active" : ""} href={item.href}>{item.label}</Link>
          ))}
        </nav>
        <div className="nav-actions">
          {signedIn ? <Link className="nav-sign nav-account" href={accountHref}>{accountLabel}</Link> : showSignIn ? <Link className="nav-sign" href="/account/login">Sign in</Link> : null}
          <Link className="nav-sign nav-talk" href={talkHref}>{talkLabel}</Link>
          {signedIn ? (
            <SignOut className="btn btn-primary nav-cta" />
          ) : (
            <Link className="btn btn-primary nav-cta" href="/account/register">Get started <Icon name="arrow" size={17} /></Link>
          )}
          <MenuButton />
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {signedIn ? <Link href={accountHref}>{accountLabel}</Link> : <Link href="/account/register">Get started</Link>}
        {signedIn ? <SignOut className="nav-menu-action" /> : showSignIn ? <Link href="/account/login">Sign in</Link> : null}
        <Link href={talkHref}>{talkLabel}</Link>
        {mobile.map((item) => <Link key={`m-${item.href}-${item.label}`} href={item.href}>{item.label}</Link>)}
      </nav>
    </header>
  );
}

export function SiteFooter({
  theme,
  footer,
}: {
  theme: Theme;
  footer: {
    blurb: string;
    mini: string;
    groups: { title: string; links: { label: string; href: string }[] }[];
    legalLeft: string;
    legalRight: string;
  };
}) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-main">
          <div className="footer-intro">
            <Brand theme={theme} />
            <p>{footer.blurb}</p>
            <div className="footer-mini">{footer.mini}</div>
          </div>
          {footer.groups.map((group) => (
            <div key={group.title}>
              <h4>{group.title}</h4>
              {group.links.map((link) => <Link key={link.label + link.href} href={link.href}>{link.label}</Link>)}
            </div>
          ))}
        </div>
        <div className="footer-bottom"><span>{footer.legalLeft}</span><span>{footer.legalRight}</span></div>
      </div>
    </footer>
  );
}

export function EndCta({ eyebrow, title, body, cta, href }: { eyebrow: string; title: string; body: string; cta: string; href: string }) {
  return (
    <section className="end-cta">
      <div className="wrap cta-inner">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <Link className="btn btn-primary" href={href}>{cta} <Icon name="arrow" size={18} /></Link>
      </div>
    </section>
  );
}

export function PhoneArt({ brand, title, sub, badge1, badge2, chip1, chip2, chip3 }: { brand: string; title: string; sub: string; badge1: string; badge2: string; chip1: string; chip2: string; chip3: string }) {
  return (
    <div className="phone-art">
      <div className="phone-rim">
        <div className="phone-screen">
          <div className="screen-top"><span>{brand}</span><span className="tiny-dot" /></div>
          <div className="phone-orb"><div className="orb-ring" /><Icon name="phone" size={40} /></div>
          <div className="phone-calltitle">{title}</div>
          <div className="phone-sub">{sub}</div>
          <div className="phone-badges"><span>{badge1}</span><span>{badge2}</span></div>
          <div className="call-buttons"><i><Icon name="phone" size={22} /></i><i><Icon name="message" size={22} /></i></div>
        </div>
      </div>
      <div className="float-chip fc1"><Icon name="checkcircle" size={16} /> {chip1}</div>
      <div className="float-chip fc2"><Icon name="spark" size={16} /> {chip2}</div>
      <div className="float-chip fc3"><Icon name="calendar" size={16} /> {chip3}</div>
    </div>
  );
}
