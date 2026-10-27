import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AuthForm } from "@/components/account/AuthForm";
import { confirmEmailCode, confirmPhoneCode, resendEmailVerification, resendPhoneVerification, saveMobile } from "../actions";
import { confirmEmailToken, verificationStatus } from "@/lib/account-verify";
import { currentUser } from "@/lib/auth";
import { customerMessage } from "@/lib/customer-message";
import { redirect } from "next/navigation";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string; phone?: string; sms?: string; error?: string; plan?: string }> }) {
  const params = await searchParams;
  const tokenNote = params.token ? confirmEmailToken(params.token).message : "";
  const user = await currentUser();
  if (!user) {
    return (
      <Frame pathname="/account/verify">
        <main className="section">
          <div className="wrap" style={{ maxWidth: 560 }}>
            <h1>Confirm your account</h1>
            <p>{tokenNote || "Sign in to confirm your email and mobile number."}</p>
            <Link className="btn btn-primary" href="/account/login">Sign in</Link>
          </div>
        </main>
      </Frame>
    );
  }
  if (user.role !== "customer") redirect("/admin");
  const status = verificationStatus(user.id);
  const note = [
    params.error ? customerMessage(params.error, "That confirmation could not be completed. Try again.") : "",
    tokenNote,
    params.email === "ok" ? "Email confirmed." : "",
    params.phone === "ok" ? "Mobile number confirmed." : "",
    params.email === "sent" ? "We sent a 6-digit code to your email. Enter that code below." : "",
    params.email === "sending" ? "The confirmation email is on its way. If it does not arrive, send it again." : "",
    params.email === "waiting" && !params.error ? "The confirmation email has not gone out yet. Send it again once outgoing email is set up." : "",
    params.sms === "sent" || params.sms === "sending" ? "A text message with your code is on its way. If it does not arrive, send it again." : "",
    params.sms === "waiting" && !status.smsReady ? "Your number is saved. A text message with the code will be sent when text messages are turned on." : "",
    params.sms === "waiting" && status.smsReady && !params.error ? "If the text message does not arrive, send the code again." : "",
  ].filter(Boolean).join(" ");
  const plan = String(params.plan || "");
  return (
    <div className="workspace-page" style={{ maxWidth: 720 }}>
      <h1>Confirm your account</h1>
      <p>Confirm the email on this account, and the mobile number, before you rely on them for sign-in and number orders.</p>
      {note ? <p className="form-feedback">{note}</p> : null}
      <section className="ws-card">
        <h2>Email</h2>
        <p>{status.email}</p>
        {status.emailVerified ? <p>Confirmed.</p> : (
          <>
            <p>Use the link in the confirmation email, or enter the 6-digit code from that email.</p>
            <AuthForm className="pub-form" action={confirmEmailCode} submit="Confirm email" fields={[{ name: "code", label: "Email code", placeholder: "123456" }]} />
            <form action={resendEmailVerification}><button className="ws-btn ghost" type="submit">Send the email again</button></form>
          </>
        )}
      </section>
      <section className="ws-card">
        <h2>Mobile number</h2>
        <p>{status.phone || "No mobile number is saved."}</p>
        {!status.phone ? <AuthForm className="pub-form" action={saveMobile} submit="Save mobile number" fields={[{ name: "phone", label: "Mobile number", type: "tel", placeholder: "+1 202 555 0100" }]} /> : null}
        {status.phone && status.phoneVerified ? <p>Confirmed.</p> : status.phone ? (
          <>
            <p>{status.smsReady ? "Enter the 6-digit code from the text message." : "Your number is saved. A text message with the code will be sent when text messages are turned on."}</p>
            <AuthForm className="pub-form" action={confirmPhoneCode} submit="Confirm mobile number" fields={[{ name: "code", label: "Text message code", placeholder: "123456" }]} />
            <form action={resendPhoneVerification}><button className="ws-btn ghost" type="submit">Send a code</button></form>
          </>
        ) : null}
      </section>
      <p><Link href={plan ? `/account/billing?plan=${encodeURIComponent(plan)}` : "/account"}>Continue to your account</Link></p>
    </div>
  );
}
