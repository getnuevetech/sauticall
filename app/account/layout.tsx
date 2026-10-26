import { currentUser } from "@/lib/auth";
import { Workspace } from "@/components/account/Workspace";
import "./workspace.css";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.mfa_pending || user.role !== "customer") return children;
  return <Workspace>{children}</Workspace>;
}
