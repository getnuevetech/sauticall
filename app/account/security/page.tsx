import { AuthForm } from "@/components/account/AuthForm";
import { AuthenticatorGuide } from "@/components/account/AuthenticatorGuide";
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
  const heading = text("mfaTitle") || "Confirm it is you";
  const intro = user.mfa_secret ? "An authenticator is on for this account. Use the code from that app when SautiCall asks for one." : required ? (text("mfaOnHint") || "An authenticator is required for this account.") : "An authenticator can be added for this account. Revealing an app password asks for a code once it is on.";
  return (
    <div className="workspace-page">
      <header className="workspace-page-head">
        <h1>{heading}</h1>
        <p>{intro}</p>
      </header>
            {!user.mfa_secret ? (
              <div className="contact-form">
                <p>{required ? "This account needs an authenticator before you can continue. An app password stays hidden until you enter a code." : "You can add an authenticator now. An administrator can also require it for this account. Once it is on, revealing an app password asks for a code."}</p>
                <AuthenticatorGuide mode="setup" />
                <div className="auth-qr" dangerouslySetInnerHTML={{ __html: qr }} />
                <p>Setup key, if the app asks you to type it.</p>
                <p><strong>{secret}</strong></p>
                <AuthForm action={enrollMfa} submit="Turn on authenticator" fields={[{ name: "code", label: "Code from the app", placeholder: "123456" }]} extra={<input type="hidden" name="secret" value={secret} />} />
              </div>
            ) : (
              <div className="contact-form">
                <p>An authenticator is saved for this account. Revealing an app password asks for a code from that app.</p>
                <AuthenticatorGuide mode="signin" />
                {!required ? <form action={clearOwnMfa}><button className="btn btn-secondary" type="submit">Remove authenticator</button></form> : null}
              </div>
            )}
    </div>
  );
}
