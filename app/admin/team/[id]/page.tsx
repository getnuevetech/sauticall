import Link from "next/link";
import { notFound } from "next/navigation";
import { saveAdminUser } from "../../desk-actions";
import { requirePermission } from "@/lib/access";
import { formatWhen } from "@/lib/format-when";
import { getDb } from "@/lib/db";

export default async function AdminUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requirePermission("access.manage");
  const { id } = await params;
  const query = await searchParams;
  const person = getDb().prepare("SELECT id, name, email, role, access_role_id, disabled, created_at FROM users WHERE id = ? AND role IN ('staff', 'super_admin')").get(Number(id)) as {
    id: number;
    name: string;
    email: string;
    role: string;
    access_role_id: number;
    disabled: number;
    created_at: string;
  } | undefined;
  if (!person) notFound();
  const roles = getDb().prepare("SELECT id, name FROM access_roles ORDER BY name").all() as { id: number; name: string }[];
  const locked = person.role === "super_admin" && actor.role !== "super_admin";
  return (
    <>
      <span className="eyebrow">Team</span>
      <h2>{person.name}</h2>
      <p><Link href="/admin/team">All admin users</Link> · Joined {formatWhen(person.created_at)}</p>
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
      {locked ? <p>Only a super admin can change this account.</p> : (
        <form className="contact-form" action={saveAdminUser}>
          <input type="hidden" name="id" value={person.id} />
          <div className="form-grid">
            <label>Name <input name="name" defaultValue={person.name} required /></label>
            <label>Email <input name="email" type="email" defaultValue={person.email} required /></label>
          </div>
          <label>New password <input name="password" type="password" minLength={10} placeholder="Leave blank to keep the current password" /></label>
          {actor.role === "super_admin" ? (
            <label>Kind
              <select name="account_role" defaultValue={person.role}>
                <option value="staff">Staff, limited by an access level</option>
                <option value="super_admin">Super admin, every page</option>
              </select>
            </label>
          ) : null}
          <label>Access level
            <select name="access_role_id" defaultValue={String(person.access_role_id || "")}>
              <option value="">Choose for a staff account</option>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <label className="check-option"><input type="checkbox" name="disabled" defaultChecked={Boolean(person.disabled)} /> Turn off sign-in</label>
          <button className="btn btn-primary" type="submit">Save admin user</button>
        </form>
      )}
    </>
  );
}
