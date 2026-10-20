import { enabled, loadSite } from "@/lib/site";
import { themeStyle } from "@/lib/theme-css";
import { SiteFooter, SiteHeader } from "./Chrome";

export function Frame({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const site = loadSite();
  const home = site.home;
  const talk = typeof home.headerTalk === "string" ? home.headerTalk : "Talk to us";
  const talkHref = typeof home.headerTalkHref === "string" ? home.headerTalkHref : "/contact";
  const cta = typeof home.headerCta === "string" ? home.headerCta : "Build my system";
  const ctaHref = typeof home.headerCtaHref === "string" ? home.headerCtaHref : "/how-it-works";
  return (
    <>
      {site.theme.fontStylesheetUrl.startsWith("https://") ? <link rel="stylesheet" href={site.theme.fontStylesheetUrl} /> : null}
      <style dangerouslySetInnerHTML={{ __html: themeStyle(site.theme) }} />
      <SiteHeader
        nav={site.nav}
        theme={site.theme}
        pathname={pathname}
        showSignIn={enabled(site.flags, "auth.show_sign_in")}
        talkLabel={talk}
        talkHref={talkHref}
        ctaLabel={cta}
        ctaHref={ctaHref}
      />
      {children}
      <SiteFooter theme={site.theme} footer={site.footer} />
    </>
  );
}
