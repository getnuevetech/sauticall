import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { AuthForm } from "@/components/account/AuthForm";
import { clearOwnMfa, enrollMfa } from "../actions";
import { currentUser } from "@/lib/auth";
import { flagOn } from "@/lib/db";
import { loadSite } from "@/lib/site";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { base32Encode } from "@/lib/auth";

export default async function SecurityPage() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (flagOn("auth.mfa") && user.mfa_secret && user.mfa_pending) redirect("/account/login?step=code");
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const required = flagOn("auth.mfa");
  const secret = base32Encode(crypto.randomBytes(20));
  const issuer = "SautiCall";
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  return (
    <Frame pathname="/account/security">
      <main>
        <AccountHero eyebrow="SECURITY" title={text("mfaTitle")} body={required ? text("mfaOnHint") : text("mfaOff")} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/security" />
            {required && !user.mfa_secret ? (
              <div className="contact-form">
                <p>Add this key to an authenticator app, then enter the 6-digit code.</p>
                <p><strong>{secret}</strong></p>
                <p>{uri}</p>
                <AuthForm action={enrollMfa} submit="Turn on authenticator" fields={[{ name: "code", label: "Code", placeholder: "123456" }]} extra={<input type="hidden" name="secret" value={secret} />} />
              </div>
            ) : null}
            {user.mfa_secret ? (
              <div className="contact-form">
                <p>An authenticator is saved for this account.</p>
                {!required ? <form action={clearOwnMfa}><button className="btn btn-secondary" type="submit">Remove authenticator</button></form> : null}
              </div>
            ) : null}
            {!required && !user.mfa_secret ? <div className="contact-form"><p>{text("mfaOff")}</p></div> : null}
          </div>
        </section>
      </main>
    </Frame>
  );
}
