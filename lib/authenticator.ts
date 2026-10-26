import QRCode from "qrcode";

export const authenticatorApps = [
  { name: "Google Authenticator", detail: "Free on iPhone and Android. Open the app, tap the plus sign, and scan the code." },
  { name: "Microsoft Authenticator", detail: "Free on iPhone and Android. Add an account, choose other account, and scan the code." },
  { name: "Authy", detail: "Free on iPhone and Android. Add an account and scan the code. Authy can keep a backup if you turn that on in the app." },
  { name: "1Password", detail: "Use this when the business already stores passwords in 1Password. Add a one-time password and scan the code." },
  { name: "Bitwarden", detail: "Use this when the business already stores passwords in Bitwarden. Edit the login and scan the code as the authenticator key." },
  { name: "Apple Passwords", detail: "Already on iPhone and Mac. Add the account, then scan the code as the verification code." },
];

export const authenticatorSetupSteps = [
  "Install one of the apps below on the phone you keep with you.",
  "In that app, add an account and choose to scan a QR code.",
  "Scan the code on this page. The new account is named SautiCall and uses your sign-in email.",
  "If the camera cannot scan, choose enter a setup key and type the key under the code. Use a 6-digit code that refreshes every 30 seconds.",
  "Type the 6-digit code the app is showing right now, then press Turn on authenticator. The code changes about every 30 seconds, so use the one currently on the screen.",
];

export const authenticatorSignInSteps = [
  "Open the same authenticator app you used when you turned this on.",
  "Find the account named SautiCall.",
  "Enter the 6-digit code it is showing now. If that code is about to change, wait for the next one.",
];

export function authenticatorUri(email: string, secret: string, issuer = "SautiCall") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function authenticatorQr(uri: string) {
  const svg = await QRCode.toString(uri, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 220,
    color: { dark: "#202b42", light: "#ffffff" },
  });
  return svg.replace(/^\s*<\?xml[^>]*>\s*/i, "").trim();
}
