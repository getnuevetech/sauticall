import { TeamDesk } from "@/components/admin/TeamDesk";
import { requirePermission } from "@/lib/access";
import { knownPermissions } from "@/lib/access-catalog";
import { getDb } from "@/lib/db";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ user?: string; error?: string; saved?: string }> }) {
  const actor = await requirePermission("access.manage");
  const query = await searchParams;
  const people = getDb().prepare("SELECT id, name, email, role, access_role_id, disabled FROM users WHERE role IN ('staff', 'super_admin') ORDER BY role DESC, name").all() as { id: number; name: string; email: string; role: "staff" | "super_admin"; access_role_id: number; disabled: number }[];
  const roles = getDb().prepare("SELECT id, name, permissions_json FROM access_roles ORDER BY name").all() as { id: number; name: string; permissions_json: string }[];
  return (
    <TeamDesk
      actorRole={actor.role}
      actorId={actor.id}
      selectedId={query.user || ""}
      notice={query.error || (query.saved ? "Admin user saved. A blank password field leaves the saved password in place." : "")}
      people={people.map((person) => ({ id: person.id, name: person.name, email: person.email, role: person.role, accessRoleId: person.access_role_id, disabled: person.disabled }))}
      roles={roles.map((role) => {
        let permissions: string[] = [];
        try {
          const parsed = JSON.parse(role.permissions_json) as unknown;
          permissions = Array.isArray(parsed) ? knownPermissions(parsed.filter((item) => typeof item === "string")) : [];
        } catch {
          permissions = [];
        }
        return { id: role.id, name: role.name, permissions };
      })}
    />
  );
}
