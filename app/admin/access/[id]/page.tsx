import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAccessRole, saveAccessRole } from "../../desk-actions";
import { requirePermission } from "@/lib/access";
import { PERMISSIONS } from "@/lib/access-catalog";
import { getDb } from "@/lib/db";

export default async function AccessEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requirePermission("access.manage");
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "new";
  const role = creating
    ? { id: 0, name: "", description: "", permissions_json: "[]" }
    : getDb().prepare("SELECT id, name, description, permissions_json FROM access_roles WHERE id = ?").get(Number(id)) as { id: number; name: string; description: string; permissions_json: string } | undefined;
  if (!role) notFound();
  const selected = new Set(JSON.parse(role.permissions_json) as string[]);
  const groups = [...new Set(PERMISSIONS.map((item) => item.group))];
  return (
    <>
      <span className="eyebrow">Team</span>
      <h2>{creating ? "New access level" : role.name}</h2>
      <p><Link href="/admin/access">All access levels</Link></p>
      {query.error ? <p className="form-feedback">{query.error}</p> : null}
      {query.saved ? <p className="form-feedback">{query.saved}</p> : null}
      <form className="contact-form" action={saveAccessRole}>
        {role.id ? <input type="hidden" name="id" value={role.id} /> : null}
        <label>Name <input name="name" defaultValue={role.name} required /></label>
        <label>What this level is for <textarea name="description" rows={2} defaultValue={role.description} /></label>
        {groups.map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            <div className="check-list">
              {PERMISSIONS.filter((item) => item.group === group).map((item) => (
                <label key={item.key}><input type="checkbox" name="permissions" value={item.key} defaultChecked={selected.has(item.key)} /> <span><b>{item.label}</b><small>{item.description}</small></span></label>
              ))}
            </div>
          </fieldset>
        ))}
        <button className="btn btn-primary" type="submit">{creating ? "Create access level" : "Save access level"}</button>
        {role.id ? <button className="btn btn-secondary" type="submit" formAction={deleteAccessRole}>Delete</button> : null}
      </form>
    </>
  );
}
