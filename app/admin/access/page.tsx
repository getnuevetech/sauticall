import { AccessDesk } from "@/components/admin/AccessDesk";
import { requirePermission } from "@/lib/access";
import { knownPermissions } from "@/lib/access-catalog";
import { getDb } from "@/lib/db";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ level?: string; error?: string; saved?: string }> }) {
  await requirePermission("access.manage");
  const query = await searchParams;
  const roles = getDb().prepare("SELECT id, name, description, permissions_json FROM access_roles ORDER BY name").all() as { id: number; name: string; description: string; permissions_json: string }[];
  const counts = getDb().prepare("SELECT access_role_id, COUNT(*) AS n FROM users WHERE role = 'staff' GROUP BY access_role_id").all() as { access_role_id: number; n: number }[];
  const used = new Map(counts.map((row) => [row.access_role_id, row.n]));
  const selected = query.level || (roles[0] ? String(roles[0].id) : "new");
  return (
    <AccessDesk
      selectedId={selected}
      notice={query.error || (query.saved ? "Access level saved. Assigned staff use these permissions the next time they open an admin page." : "")}
      roles={roles.map((role) => {
        let permissions: string[] = [];
        try {
          const parsed = JSON.parse(role.permissions_json) as unknown;
          permissions = Array.isArray(parsed) ? knownPermissions(parsed.filter((item) => typeof item === "string")) : [];
        } catch {
          permissions = [];
        }
        return { id: role.id, name: role.name, description: role.description, permissions, staff: used.get(role.id) || 0 };
      })}
    />
  );
}
