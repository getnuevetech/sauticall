import { verificationStatus } from "@/lib/account-verify";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { shownAccountName } from "@/lib/pbx-user";
import { WorkspaceFrame } from "./WorkspaceFrame";

export async function Workspace({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return children;
  const department = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(user.id) as { name: string } | undefined;
  const profile = getDb().prepare("SELECT business_name FROM users WHERE id = ?").get(user.id) as { business_name: string } | undefined;
  const company = shownAccountName(department?.name || "", profile?.business_name || "", user.name) || "Your business";
  const alerts = (getDb().prepare("SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND status NOT IN ('resolved', 'closed')").get(user.id) as { n: number }).n;
  const verified = verificationStatus(user.id);
  const needsVerify = (verified.emailRequired && !verified.emailVerified) || (verified.smsRequired && !verified.phoneVerified);
  return (
    <WorkspaceFrame name={user.name} email={user.email} company={company} alerts={alerts} needsVerify={needsVerify}>
      {children}
    </WorkspaceFrame>
  );
}
