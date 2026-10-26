export function smsDestination(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const did = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(did) ? did : "";
}

export function smsAccountNote(result: { ok: boolean; owned: boolean } | null) {
  if (!result) return "";
  if (!result.ok) return " The text-message number could not be checked.";
  return result.owned ? " The text-message number is on this account." : " The text-message number is not on this account.";
}
