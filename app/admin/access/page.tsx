import { assignAccess, createStaff, deleteAccessRole, saveAccessRole } from "../desk-actions";
import { requirePermission } from "@/lib/access";
import { PERMISSIONS } from "@/lib/access-catalog";
import { getDb } from "@/lib/db";

type Role = { id: number; name: string; description: string; permissions_json: string };
type Staff = { id: number; name: string; email: string; role: string; access_role_id: number };

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("access.manage");
  const params = await searchParams;
  const roles = getDb().prepare("SELECT id, name, description, permissions_json FROM access_roles ORDER BY name").all() as Role[];
  const people = getDb().prepare("SELECT id, name, email, role, access_role_id FROM users WHERE role IN ('staff', 'super_admin') ORDER BY role DESC, name").all() as Staff[];
  const groups = [...new Set(PERMISSIONS.map((item) => item.group))];
  return (
    <>
      <span className="eyebrow">Access</span>
      <h2>Access levels</h2>
      <p>Each part of admin is a separate permission. A staff account sees only the permissions on its access level. The super admin account always sees everything. Customer support, Accounts, Website, and Phone operations are ready to assign.</p>
      {params.error ? <p className="form-feedback">{params.error}</p> : null}
      {roles.map((role) => {
        const selected = new Set(JSON.parse(role.permissions_json) as string[]);
        return (
          <form key={role.id} className="contact-form" action={saveAccessRole} style={{ marginBottom: 18 }}>
            <input type="hidden" name="id" value={role.id} />
            <label>Name <input name="name" defaultValue={role.name} required /></label>
            <label>What this level is for <textarea name="description" rows={2} defaultValue={role.description} /></label>
            {groups.map((group) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                <div className="check-list">
                  {PERMISSIONS.filter((item) => item.group === group).map((item) => (
                    <label key={item.key}><input type="checkbox" name="permissions" value={item.key} defaultChecked={selected.has(item.key)} /> {item.label}</label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className="btn btn-primary" type="submit">Save access level</button>
            <button className="btn btn-secondary" type="submit" formAction={deleteAccessRole}>Delete</button>
          </form>
        );
      })}
      <form className="contact-form" action={saveAccessRole} style={{ marginBottom: 18 }}>
        <h3>New access level</h3>
        <label>Name <input name="name" required /></label>
        <label>What this level is for <textarea name="description" rows={2} /></label>
        {groups.map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            <div className="check-list">
              {PERMISSIONS.filter((item) => item.group === group).map((item) => (
                <label key={item.key}><input type="checkbox" name="permissions" value={item.key} /> {item.label}</label>
              ))}
            </div>
          </fieldset>
        ))}
        <button className="btn btn-primary" type="submit">Create access level</button>
      </form>
      <h3>Staff accounts</h3>
      {people.map((person) => (
        <article key={person.id} className="feature-card" style={{ marginBottom: 12 }}>
          <h3>{person.name}</h3>
          <p>{person.email} · {person.role === "super_admin" ? "Super admin, all access" : "Staff"}</p>
          {person.role === "staff" ? (
            <form action={assignAccess} className="form-grid">
              <input type="hidden" name="id" value={person.id} />
              <label>Access level
                <select name="access_role_id" defaultValue={String(person.access_role_id || "")}>
                  <option value="0">No access</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
              <button className="btn btn-secondary" type="submit">Save</button>
            </form>
          ) : null}
        </article>
      ))}
      <form className="contact-form" action={createStaff}>
        <h3>New staff account</h3>
        <div className="form-grid">
          <label>Name <input name="name" required /></label>
          <label>Email <input name="email" type="email" required /></label>
        </div>
        <label>Password <input name="password" type="password" minLength={10} required /></label>
        <label>Access level
          <select name="access_role_id" required defaultValue="">
            <option value="" disabled>Choose</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Create staff account</button>
      </form>
    </>
  );
}
