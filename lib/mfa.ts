import { totpMatches } from "./auth";
import { flagOn } from "./db";
import { mfaIsRequired } from "./mfa-rules";

export { mfaIsRequired };

export function accountNeedsMfa(user: { mfa_required?: number | null }) {
  return mfaIsRequired(flagOn("auth.mfa"), user.mfa_required);
}

export function revealBlock(user: { mfa_secret: string | null; mfa_required?: number | null }, code: string) {
  if (accountNeedsMfa(user) && !user.mfa_secret) return "Set up your authenticator before revealing this.";
  if (user.mfa_secret && !totpMatches(user.mfa_secret, code)) return "That code is not valid.";
  return "";
}
