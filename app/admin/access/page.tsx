import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { getDb } from "@/lib/db";

type Role = { id: number; name: string; description: string; permissions_json: string };

export default async function AccessPage() {
  await requirePermission("access.manage");
  const roles = getDb().prepare("SELECT id, name, description, permissions_json FROM access_roles ORDER BY name").all() as Role[];
  const counts = getDb().prepare("SELECT access_role_id, COUNT(*) AS n FROM users WHERE role = 'staff' GROUP BY access_role_id").all() as { access_role_id: number; n: number }[];
  const used = new Map(counts.map((row) => [row.access_role_id, row.n]));
  return (
    <>
      <span className="eyebrow">Team</span>
      <h2>Access levels</h2>
      <p>An access level is the set of admin pages a staff account can open. Super admin accounts are not limited by these levels. Admin users are managed separately from customers.</p>
      <p><Link className="btn btn-primary" href="/admin/access/new">New access level</Link></p>
      <div className="desk-table-wrap">
        <table className="desk-table">
          <thead>
            <tr><th>Level</th><th>Permissions</th><th>Staff</th><th></th></tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const permissions = JSON.parse(role.permissions_json) as string[];
              return (
                <tr key={role.id}>
                  <td><b>{role.name}</b><span>{role.description}</span></td>
                  <td>{permissions.length}</td>
                  <td>{used.get(role.id) || 0}</td>
                  <td><Link href={`/admin/access/${role.id}`}>Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
