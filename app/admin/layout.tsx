import { redirect } from "next/navigation";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { visibleAdminNav } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  if (!user) redirect("/account/login");
  return (
    <AdminFrame name={user.name} email={user.email} groups={visibleAdminNav(user)}>
      {children}
    </AdminFrame>
  );
}
