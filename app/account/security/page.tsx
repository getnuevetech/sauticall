import { Frame } from "@/components/site/Frame";
import { AccountHero, AccountNav } from "@/components/account/Portal";
import { AuthForm } from "@/components/account/AuthForm";
import { clearOwnMfa, enrollMfa } from "../actions";
import { authenticatorQr, authenticatorUri } from "@/lib/authenticator";
import { currentUser } from "@/lib/auth";
import { accountNeedsMfa } from "@/lib/mfa";
import { loadSite } from "@/lib/site";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { base32Encode } from "@/lib/auth";

export default async function SecurityPage() {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (accountNeedsMfa(user) && user.mfa_secret && user.mfa_pending) redirect("/account/login?step=code");
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const required = accountNeedsMfa(user);
  const secret = base32Encode(crypto.randomBytes(20));
  const uri = authenticatorUri(user.email, secret);
  const qr = await authenticatorQr(uri);
  return (
    <Frame pathname="/account/security">
      <main>
        <AccountHero eyebrow="SECURITY" title={text("mfaTitle") || "Confirm it is you"} body={required ? (text("mfaOnHint") || "An authenticator is required for this account.") : "An authenticator can be added for this account. Revealing an app password asks for a code once it is on."} />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <AccountNav pathname="/account/security" />
            {!user.mfa_secret ? (
              <div className="contact-form">
                <p>{required ? "Scan the code with an authenticator app, then enter the 6-digit code. An app password stays hidden until you enter a code." : "Scan the code to add an authenticator. An administrator can require it for this account. Once it is on, revealing an app password asks for a code."}</p>
                <div className="auth-qr" dangerouslySetInnerHTML={{ __html: qr }} />
                <p>If the app cannot scan, enter this key by hand.</p>
                <p><strong>{secret}</strong></p>
                <AuthForm action={enrollMfa} submit="Turn on authenticator" fields={[{ name: "code", label: "Code", placeholder: "123456" }]} extra={<input type="hidden" name="secret" value={secret} />} />
              </div>
            ) : (
              <div className="contact-form">
                <p>An authenticator is saved for this account. Revealing an app password asks for a code.</p>
                {!required ? <form action={clearOwnMfa}><button className="btn btn-secondary" type="submit">Remove authenticator</button></form> : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </Frame>
  );
}
