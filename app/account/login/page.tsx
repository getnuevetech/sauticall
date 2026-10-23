import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AuthForm } from "@/components/account/AuthForm";
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
      <main>
        <section className="inner-hero">
          <div className="wrap">
            <span className="eyebrow">{text("loginEyebrow")}</span>
            <h1>{params.step === "code" ? text("mfaTitle") : text("loginTitle")}</h1>
            <p>{params.step === "code" ? text("mfaBody") : text("loginBody")}</p>
          </div>
        </section>
        <section className="section">
          <div className="wrap" style={{ maxWidth: 640 }}>
            {!passwordOn ? <div className="contact-form"><p>{text("loginClosed")}</p></div> : null}
            {passwordOn && params.step === "code" ? (
              <AuthForm action={confirmMfa} submit="Confirm code" fields={[{ name: "code", label: "Authenticator code", placeholder: "123456" }]} />
            ) : null}
            {passwordOn && params.step !== "code" && flagOn("auth.signup") ? <p><Link className="btn btn-secondary" href="/account/register">Create an account</Link></p> : null}
            {passwordOn && params.step !== "code" ? (
              <AuthForm
                action={login}
                submit={text("loginSubmit")}
                fields={[
                  { name: "email", label: "Email", type: "email", placeholder: "you@business.com" },
                  { name: "password", label: "Password", type: "password" },
                ]}
                extra={flagOn("auth.signup") ? <p><Link className="text-link" href="/account/register">Create an account</Link></p> : null}
              />
            ) : null}
          </div>
        </section>
      </main>
    </Frame>
  );
}
