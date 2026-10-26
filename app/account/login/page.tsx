import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AuthSplit } from "@/components/site/PublicSite";
import { AuthForm } from "@/components/account/AuthForm";
import { AuthenticatorGuide } from "@/components/account/AuthenticatorGuide";
import { confirmMfa, login } from "../actions";
import { currentUser } from "@/lib/auth";
import { flagOn } from "@/lib/db";
import { loadSite } from "@/lib/site";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const params = await searchParams;
  const site = loadSite();
  const copy = site.account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const user = await currentUser();
  if (user && params.step !== "code") redirect(user.role === "customer" ? "/account" : "/admin");
  const passwordOn = flagOn("auth.password_login");
  return (
    <Frame pathname="/account/login">
      <AuthSplit
        kicker={params.step === "code" ? "Confirm it is you" : "Sign in"}
        scene="calls"
        title={params.step === "code" ? text("mfaTitle") : <>Your business calls. <span className="accent">All together.</span></>}
        lead={params.step === "code" ? text("mfaBody") : "Manage your numbers, team and call handling in one place."}
        step={params.step === "code" ? "code" : undefined}
      >
        <h1>{params.step === "code" ? text("mfaTitle") : "Welcome back"}</h1>
        <p>{params.step === "code" ? text("mfaBody") : "Sign in to your SautiCall account."}</p>
        {!passwordOn ? <p>{text("loginClosed")}</p> : null}
        {passwordOn && params.step === "code" ? (
          <>
            <AuthenticatorGuide mode="signin" />
            <AuthForm className="pub-form" action={confirmMfa} submit="Confirm code" fields={[{ name: "code", label: "Code from the app", placeholder: "123456" }]} />
          </>
        ) : null}
        {passwordOn && params.step !== "code" ? (
          <AuthForm
            className="pub-form"
            action={login}
            submit="Sign in"
            fields={[
              { name: "email", label: "Email address", type: "email", placeholder: "you@business.com" },
              { name: "password", label: "Password", type: "password", placeholder: "Enter your password" },
            ]}
          />
        ) : null}
        {passwordOn && params.step !== "code" && flagOn("auth.signup") ? <p>New to SautiCall? <Link href="/account/register">Create an account</Link></p> : null}
        {passwordOn && params.step !== "code" ? <p>Having trouble signing in? <Link href="/contact">Contact support</Link></p> : null}
      </AuthSplit>
    </Frame>
  );
}
