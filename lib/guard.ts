import { redirect } from "next/navigation";
import { currentUser } from "./auth";
import { accountNeedsMfa } from "./mfa";

export async function guardAccount(options?: { allowMissingMfa?: boolean }) {
  const user = await currentUser();
  if (!user) redirect("/account/login");
  if (accountNeedsMfa(user) && user.mfa_secret && user.mfa_pending) redirect("/account/login?step=code");
  if (!options?.allowMissingMfa && accountNeedsMfa(user) && !user.mfa_secret) redirect("/account/security");
  return user;
}
