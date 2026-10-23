import Link from "next/link";
import { saveAdminUser } from "../desk-actions";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";

type Person = { id: number; name: string; email: string; role: string; access_role_id: number; disabled: number };
type Role = { id: number; name: string };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requirePermission("access.manage");
  const query = await searchParams;
  const people = getDb().prepare("SELECT id, name, email, role, access_role_id, disabled FROM users WHERE role IN ('staff', 'super_admin') ORDER BY role DESC, name").all() as Person[];
  const roles = getDb().prepare("SELECT id, name FROM access_roles ORDER BY name").all() as Role[];
  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  return (
    <>
      <span className="eyebrow">Team</span>
      <h2>Admin users</h2>
      <p>These are the people who sign in to admin. Customers are listed under Customer accounts and never appear here. A staff account only opens the pages on its access level. A super admin can open every page.</p>
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
      <div className="desk-table-wrap">
        <table className="desk-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Kind</th><th>Access level</th><th>Sign-in</th><th></th></tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td><b>{person.name}</b></td>
                <td>{person.email}</td>
                <td>{person.role === "super_admin" ? "Super admin" : "Staff"}</td>
                <td>{person.role === "super_admin" ? "Everything" : roleName.get(person.access_role_id) || "No access"}</td>
                <td>{person.disabled ? "Turned off" : "On"}</td>
                <td><Link href={`/admin/team/${person.id}`}>Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="contact-form" action={saveAdminUser}>
        <h3>New admin user</h3>
        <div className="form-grid">
          <label>Name <input name="name" required /></label>
          <label>Email <input name="email" type="email" required /></label>
        </div>
        <label>Password <input name="password" type="password" minLength={10} required /></label>
        {actor.role === "super_admin" ? (
          <label>Kind
            <select name="account_role" defaultValue="staff">
              <option value="staff">Staff, limited by an access level</option>
              <option value="super_admin">Super admin, every page</option>
            </select>
          </label>
        ) : null}
        <label>Access level
          <select name="access_role_id" defaultValue="">
            <option value="" disabled>Choose for a staff account</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Create admin user</button>
      </form>
    </>
  );
}
