import { redirect } from "next/navigation";
import { currentUser } from "./auth";
import { flagOn } from "./db";

export async function guardAccount(options?: { allowMissingMfa?: boolean }) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (flagOn("auth.mfa") && user.mfa_secret && user.mfa_pending) redirect("/account/login?step=code");
  if (!options?.allowMissingMfa && flagOn("auth.mfa") && !user.mfa_secret) redirect("/account/security");
  return user;
}
