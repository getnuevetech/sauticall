import QRCode from "qrcode";

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
