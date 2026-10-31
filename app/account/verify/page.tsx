import Link from "next/link";
import { Frame } from "@/components/site/Frame";
import { AuthForm } from "@/components/account/AuthForm";
import { AddressEditor } from "@/components/account/AddressEditor";
import { confirmEmailCode, confirmPhoneCode, resendEmailVerification, resendPhoneVerification, saveEmergencyAddress, saveMobile } from "../actions";
import { confirmEmailToken, verificationStatus } from "@/lib/account-verify";
import { currentUser } from "@/lib/auth";
import { customerMessage } from "@/lib/customer-message";
import { clientMailbox } from "@/lib/customer-code";
import { ensureCustomerCode } from "@/lib/customer-code-store";
import { flagOn } from "@/lib/db";
import { getEmergency } from "@/lib/e911";
import { placesConfigured } from "@/lib/google-places";
import { redirect } from "next/navigation";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string; phone?: string; sms?: string; address?: string; error?: string; plan?: string }> }) {
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
  const testCode = flagOn("auth.test_code");
  const emailOn = status.emailRequired;
  const smsOn = status.smsRequired;
  const errorNote = params.error ? customerMessage(params.error, "That confirmation could not be completed. Try again.") : "";
  const note = [
    tokenNote,
    params.email === "ok" ? "Email confirmed." : "",
    params.phone === "ok" ? "Mobile number confirmed." : "",
    params.phone === "saved" ? "Mobile number saved." : "",
    params.address === "ok" ? "Address saved. It is sent to the VoIP.ms client for this account." : "",
    emailOn && testCode && !status.emailVerified ? "Enter 123456 to confirm this email. No email is sent while the test code is on." : "",
    smsOn && testCode && status.phone && !status.phoneVerified ? "Enter 123456 to confirm this mobile number. No text is sent while the test code is on." : "",
    emailOn && !testCode && params.email === "sent" ? "We sent a 6-digit code to your email. Enter that code below." : "",
    emailOn && !testCode && params.email === "sending" ? "The confirmation email is on its way. If it does not arrive, send it again." : "",
    emailOn && !testCode && params.email === "waiting" && !params.error ? "The confirmation email has not gone out yet. Send it again once outgoing email is set up." : "",
    smsOn && !testCode && (params.sms === "sent" || params.sms === "sending") ? "A text message with your code is on its way. If it does not arrive, send it again." : "",
    smsOn && !testCode && params.sms === "waiting" && !status.smsReady ? "Your number is saved. A text message with the code will be sent when text messages are turned on." : "",
    smsOn && !testCode && params.sms === "waiting" && status.smsReady && !params.error ? "If the text message does not arrive, send the code again." : "",
  ].filter(Boolean).join(" ");
  const plan = String(params.plan || "");
  const code = ensureCustomerCode(user.id);
  const mailbox = clientMailbox(code);
  const savedAddress = getEmergency(user.id);
  const checks = [
    emailOn ? (status.emailVerified ? "Email confirmed" : "Email still needs confirmation") : "Email confirmation is turned off",
    smsOn ? (status.phoneVerified ? "Mobile number confirmed" : "Mobile number still needs confirmation") : "Mobile confirmation is turned off",
    status.addressSaved ? "Address updated" : "Address still needs an update",
  ];
  return (
    <div className="workspace-page" style={{ maxWidth: 720 }}>
      <h1>Confirm your account</h1>
      <p>{emailOn || smsOn ? "Confirm the items an administrator still requires, and save a complete address." : "Email and mobile confirmation are turned off. Save a complete address to finish."}</p>
      {code ? <p>Customer ID {code}. Phone-company mail uses {mailbox}.</p> : null}
      <ul>{checks.map((item) => <li key={item}>{item}</li>)}</ul>
      {errorNote ? <p className="form-feedback form-error" role="alert">{errorNote}</p> : null}
      {note ? <p className="form-feedback" role="status">{note}</p> : null}
      <section className="ws-card">
        <h2>Email</h2>
        <p>{status.email}</p>
        {!emailOn ? <p>Email confirmation is turned off. This address stays unconfirmed until an administrator turns confirmation back on.</p> : status.emailVerified ? <p>Confirmed.</p> : (
          <>
            <p>{testCode ? "Enter 123456. No confirmation email is sent while the test code is on." : "Use the link in the confirmation email, or enter the 6-digit code from that email."}</p>
            <AuthForm className="pub-form" action={confirmEmailCode} submit="Confirm email" fields={[{ name: "code", label: "Email code", placeholder: "123456" }]} />
            {testCode ? null : <form action={resendEmailVerification}><button className="ws-btn ghost" type="submit">Send the email again</button></form>}
          </>
        )}
      </section>
      <section className="ws-card">
        <h2>Mobile number</h2>
        <p>{status.phone || "No mobile number is saved."}</p>
        {!status.phone ? <AuthForm className="pub-form" action={saveMobile} submit="Save mobile number" fields={[{ name: "phone", label: "Mobile number", type: "tel", placeholder: "+1 202 555 0100" }]} /> : null}
        {!smsOn && status.phone ? <p>Mobile confirmation is turned off. This number stays unconfirmed until an administrator turns confirmation back on.</p> : null}
        {smsOn && status.phone && status.phoneVerified ? <p>Confirmed.</p> : null}
        {smsOn && status.phone && !status.phoneVerified ? (
          <>
            <p>{testCode ? "Enter 123456. No text message is sent while the test code is on." : status.smsReady ? "Enter the 6-digit code from the text message." : "Your number is saved. A text message with the code will be sent when text messages are turned on."}</p>
            <AuthForm className="pub-form" action={confirmPhoneCode} submit="Confirm mobile number" fields={[{ name: "code", label: "Text message code", placeholder: "123456" }]} />
            {testCode ? null : <form action={resendPhoneVerification}><button className="ws-btn ghost" type="submit">Send a code</button></form>}
          </>
        ) : null}
      </section>
      <section className="ws-card">
        <h2>Address</h2>
        {status.addressSaved && savedAddress ? <p>{savedAddress.street_number} {savedAddress.street_name}, {savedAddress.city}, {savedAddress.state} {savedAddress.zip}</p> : <p>No complete address is saved yet.</p>}
        <AddressEditor
          className="set-form"
          action={saveEmergencyAddress}
          next="verify"
          lookup={placesConfigured()}
          submitLabel="Save address"
          defaults={{
            full_name: savedAddress?.full_name || user.name,
            street_number: savedAddress?.street_number || "",
            street_name: savedAddress?.street_name || "",
            address_type: savedAddress?.address_type || "",
            address_number: savedAddress?.address_number || "",
            city: savedAddress?.city || "",
            state: savedAddress?.state || "",
            country: savedAddress?.country || "US",
            zip: savedAddress?.zip || "",
          }}
        />
      </section>
      <p><Link href={plan ? `/account/billing?plan=${encodeURIComponent(plan)}` : "/account"}>Continue to your account</Link></p>
    </div>
  );
}
