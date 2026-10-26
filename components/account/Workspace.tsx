import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { acceptedDepartmentName } from "@/lib/pbx-user";
import { WorkspaceFrame } from "./WorkspaceFrame";

export async function Workspace({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return children;
  const department = getDb().prepare("SELECT name FROM pbx_departments WHERE user_id = ?").get(user.id) as { name: string } | undefined;
  const company = acceptedDepartmentName(department?.name || "") || "Your business";
  const alerts = (getDb().prepare("SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND status NOT IN ('resolved', 'closed')").get(user.id) as { n: number }).n;
  const verified = getDb().prepare("SELECT email_verified_at, phone_verified_at FROM users WHERE id = ?").get(user.id) as { email_verified_at: string; phone_verified_at: string } | undefined;
  return (
    <WorkspaceFrame name={user.name} email={user.email} company={company} alerts={alerts} needsVerify={!verified?.email_verified_at || !verified?.phone_verified_at}>
      {children}
    </WorkspaceFrame>
  );
}
