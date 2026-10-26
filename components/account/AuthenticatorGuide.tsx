import { authenticatorApps, authenticatorSetupSteps, authenticatorSignInSteps } from "@/lib/authenticator";

export function AuthenticatorGuide({ mode }: { mode: "setup" | "signin" }) {
  const steps = mode === "setup" ? authenticatorSetupSteps : authenticatorSignInSteps;
  return (
    <div className="auth-guide">
      <h3>{mode === "setup" ? "How to turn this on" : "Where to find the code"}</h3>
      <ol>
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <h3>Apps you can use</h3>
      <p>{mode === "setup" ? "A free phone app is enough. Pick one you can open whenever SautiCall asks for a code." : "The code is in the app you chose when you set this up."}</p>
      <ul>
        {authenticatorApps.map((app) => <li key={app.name}><strong>{app.name}.</strong> {app.detail}</li>)}
      </ul>
    </div>
  );
}
