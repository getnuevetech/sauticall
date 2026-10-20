import { redirect } from "next/navigation";
import { Frame } from "@/components/site/Frame";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireStaff } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  if (!user) redirect("/account/login");
  return (
    <Frame pathname="/admin">
      <main>
        <section className="section">
          <div className="wrap about-grid">
            <AdminNav />
            <div>{children}</div>
          </div>
        </section>
      </main>
    </Frame>
  );
}
