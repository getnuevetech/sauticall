import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AuthSplit } from "@/components/site/PublicSite";
import { AuthForm } from "@/components/account/AuthForm";
import { AuthenticatorGuide } from "@/components/account/AuthenticatorGuide";
import { confirmMfa, login } from "../actions";
import { currentUser } from "@/lib/auth";
import { flagOn } from "@/lib/db";
import { copyLine } from "@/lib/public-copy";
import { loadSite } from "@/lib/site";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const params = await searchParams;
  const site = loadSite();
  const copy = site.account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const say = (key: string) => copyLine(copy, "page.account", key);
  const user = await currentUser();
  if (user && params.step !== "code") redirect(user.role === "customer" ? "/account" : "/admin");
  const passwordOn = flagOn("auth.password_login");
  return (
    <Frame pathname="/account/login">
      <AuthSplit
        kicker={params.step === "code" ? text("mfaTitle") : say("loginKicker")}
        scene="calls"
        art="/marketing/login-art.png"
        title={params.step === "code" ? text("mfaTitle") : <>{say("loginHeadline")} <span className="accent">{say("loginHeadlineAccent")}</span></>}
        lead={params.step === "code" ? text("mfaBody") : say("loginLead")}
        step={params.step === "code" ? "code" : undefined}
        backLabel={say("authBack")}
        helpLabel={say("authHelp")}
      >
        <h1>{params.step === "code" ? text("mfaTitle") : say("loginHeading")}</h1>
        <p>{params.step === "code" ? text("mfaBody") : say("loginBody")}</p>
        {!passwordOn ? <p>{text("loginClosed")}</p> : null}
        {passwordOn && params.step === "code" ? (
          <>
            <AuthenticatorGuide mode="signin" />
            <AuthForm className="pub-form" action={confirmMfa} submit={say("codeSubmit")} fields={[{ name: "code", label: say("codeLabel"), placeholder: "123456" }]} />
          </>
        ) : null}
        {passwordOn && params.step !== "code" ? (
          <AuthForm
            className="pub-form"
            action={login}
            submit={say("loginSubmit")}
            fields={[
              { name: "email", label: say("loginEmail"), type: "email", placeholder: say("loginEmailHint") },
              { name: "password", label: say("loginPassword"), type: "password", placeholder: say("loginPasswordHint") },
            ]}
          />
        ) : null}
        {passwordOn && params.step !== "code" && flagOn("auth.signup") ? <p>{say("loginNew")} <Link href="/account/register">{say("loginNewLink")}</Link></p> : null}
        {passwordOn && params.step !== "code" ? <p>{say("loginTrouble")} <Link href="/contact">{say("loginTroubleLink")}</Link></p> : null}
      </AuthSplit>
    </Frame>
  );
}
