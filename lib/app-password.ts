import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#";

export function appPassword() {
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function voipLinePasswordOk(value: string) {
  return /^[A-Za-z0-9!#$%&/()=?*[\]_:.,{}+-]+$/.test(value);
}
