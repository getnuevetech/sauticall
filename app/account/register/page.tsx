import { Frame } from "@/components/site/Frame";
import { AuthForm } from "@/components/account/AuthForm";
import { register } from "../actions";
import { flagOn } from "@/lib/db";
import { loadSite } from "@/lib/site";

export default function RegisterPage() {
  const copy = loadSite().account;
  const text = (key: string) => (typeof copy[key] === "string" ? String(copy[key]) : "");
  const open = flagOn("auth.signup");
  return (
    <Frame pathname="/account/register">
      <main>
        <section className="inner-hero">
          <div className="wrap">
            <span className="eyebrow">{text("registerEyebrow")}</span>
            <h1>{text("registerTitle")}</h1>
            <p>{text("registerBody")}</p>
          </div>
        </section>
        <section className="section">
          <div className="wrap" style={{ maxWidth: 640 }}>
            {open ? (
              <AuthForm
                action={register}
                submit={text("registerSubmit")}
                fields={[
                  { name: "name", label: "Full name", placeholder: "Your name" },
                  { name: "email", label: "Work email", type: "email", placeholder: "you@business.com" },
                  { name: "password", label: "Password", type: "password" },
                ]}
              />
            ) : (
              <div className="contact-form"><p>{text("registerClosed")}</p></div>
            )}
          </div>
        </section>
      </main>
    </Frame>
  );
}
