import { currentUser } from "@/lib/auth";
import { enabled, loadSite } from "@/lib/site";
import { themeStyle } from "@/lib/theme-css";
import { SiteFooter, SiteHeader } from "./Chrome";

export async function Frame({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const site = loadSite();
  const user = await currentUser();
  const home = site.home;
  const talk = typeof home.headerTalk === "string" ? home.headerTalk : "Talk to us";
  const talkHref = typeof home.headerTalkHref === "string" ? home.headerTalkHref : "/contact";
  const auth = pathname === "/account/login" || pathname === "/account/register";
  const shell = pathname.startsWith("/admin") ? "" : auth ? "pub pub-auth" : "pub";
  return (
    <div className={shell}>
      {site.theme.fontStylesheetUrl.startsWith("https://") ? <link rel="stylesheet" href={site.theme.fontStylesheetUrl} /> : null}
      <style dangerouslySetInnerHTML={{ __html: themeStyle(site.theme) }} />
      <SiteHeader
        nav={site.nav}
        theme={site.theme}
        pathname={pathname}
        showSignIn={enabled(site.flags, "auth.show_sign_in")}
        signedIn={Boolean(user)}
        accountHref={user?.role === "customer" ? "/account" : "/admin"}
        accountLabel={user?.role === "customer" ? "Account" : "Admin"}
        talkLabel={talk}
        talkHref={talkHref}
      />
      {children}
      {auth ? null : <SiteFooter theme={site.theme} footer={site.footer} />}
    </div>
  );
}
