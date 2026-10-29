"use client";

import { useState } from "react";
import { saveAdminUser } from "@/app/admin/desk-actions";
import { accessSummary } from "@/lib/access-catalog";

type Role = { id: number; name: string; permissions: string[] };
type Person = { id: number; name: string; email: string; role: "staff" | "super_admin"; accessRoleId: number; disabled: number };

export function TeamDesk({ people, roles, actorRole, actorId, selectedId, notice }: { people: Person[]; roles: Role[]; actorRole: string; actorId: number; selectedId: string; notice: string }) {
  const [openId, setOpenId] = useState(selectedId);
  const creating = openId === "new";
  const current = people.find((person) => String(person.id) === openId);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [name, setName] = useState(current?.name || "");
  const [email, setEmail] = useState(current?.email || "");
  const [accountRole, setAccountRole] = useState<"staff" | "super_admin">(current?.role || "staff");
  const [accessRoleId, setAccessRoleId] = useState(String(current?.accessRoleId || roles[0]?.id || ""));
  const [enabled, setEnabled] = useState(current ? current.disabled === 0 : true);
  const [replacePassword, setReplacePassword] = useState(creating);
  const [review, setReview] = useState(false);
  const needle = query.trim().toLowerCase();
  const visible = people.filter((person) => {
    const kindOk = kindFilter === "all" || person.role === kindFilter;
    const textOk = !needle || `${person.name} ${person.email}`.toLowerCase().includes(needle);
    return kindOk && textOk;
  });
  const open = creating || Boolean(current);
  const locked = Boolean(current && current.role === "super_admin" && actorRole !== "super_admin");
  const remainingSupers = people.filter((person) => person.role === "super_admin" && person.disabled === 0 && person.id !== current?.id).length;
  const role = roles.find((item) => String(item.id) === accessRoleId);
  const summary = accessSummary(accountRole === "super_admin" ? [] : role?.permissions || [], accountRole);
  const dirty = creating || Boolean(current && (name !== current.name || email !== current.email || accountRole !== current.role || (accountRole === "staff" && Number(accessRoleId) !== current.accessRoleId) || enabled !== (current.disabled === 0) || replacePassword));

  function choose(person: Person | "new") {
    const next = person === "new" ? null : person;
    setName(next?.name || "");
    setEmail(next?.email || "");
    setAccountRole(next?.role || "staff");
    setAccessRoleId(String(next?.accessRoleId || roles[0]?.id || ""));
    setEnabled(next ? next.disabled === 0 : true);
    setReplacePassword(person === "new");
    setReview(false);
    const nextId = person === "new" ? "new" : String(person.id);
    setOpenId(nextId);
    window.history.replaceState(null, "", `/admin/team?user=${nextId}`);
  }

  return (
    <div className="ops">
      <div>
        <p className="ops-kicker">Team & access / Admin users</p>
        <h1>Admin users</h1>
        <p>Manage staff access to the admin portal.</p>
        {notice ? <p className="form-feedback">{notice}</p> : null}
        <form className="ops-toolbar" onSubmit={(event) => event.preventDefault()}>
          <button className="btn btn-primary" type="button" onClick={() => choose("new")}>Add admin user</button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" aria-label="Search admin users" />
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} aria-label="Kind">
            <option value="all">All kinds</option>
            <option value="super_admin">Super admin</option>
            <option value="staff">Staff</option>
          </select>
        </form>
        {visible.length === 0 ? (
          <section className="ops-empty"><h2>No matching admin users</h2><p>No accounts match this search.</p></section>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Name</th><th>Email</th><th>Kind</th><th>Access level</th><th>Sign-in</th><th></th></tr></thead>
              <tbody>
                {visible.map((person) => (
                  <tr key={person.id} data-current={current?.id === person.id ? "true" : undefined}>
                    <td><strong>{person.name}</strong></td>
                    <td>{person.email}</td>
                    <td>{person.role === "super_admin" ? "Super admin" : "Staff"}</td>
                    <td>{person.role === "super_admin" ? "Everything" : roles.find((item) => item.id === person.accessRoleId)?.name || "No access"}</td>
                    <td><span className={`ops-badge ${person.disabled ? "muted" : "ok"}`}>{person.disabled ? "Disabled" : "Enabled"}</span></td>
                    <td><button type="button" className={`btn ${current?.id === person.id ? "btn-primary" : "btn-secondary"}`} onClick={() => choose(person)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open ? (
        <aside className="ops-drawer">
          <div className="ops-drawer-head">
            <h2>{creating ? "Add admin user" : "Edit admin user"}</h2>
            <button type="button" aria-label="Close" onClick={() => { setReview(false); setOpenId(""); window.history.replaceState(null, "", "/admin/team"); }}>×</button>
          </div>
          {locked ? <p>Only a super admin can change this account.</p> : (
            <form className="ops-stack" action={saveAdminUser}>
              {current ? <input type="hidden" name="id" value={current.id} /> : null}
              <label>Name <input name="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
              <label>Email <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              {actorRole === "super_admin" ? (
                <label>Kind
                  <select name="account_role" value={accountRole} onChange={(event) => setAccountRole(event.target.value === "super_admin" ? "super_admin" : "staff")}>
                    <option value="staff">Staff</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </label>
              ) : <input type="hidden" name="account_role" value="staff" />}
              {accountRole === "staff" ? (
                <label>Access level
                  <select name="access_role_id" value={accessRoleId} onChange={(event) => setAccessRoleId(event.target.value)}>
                    {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="ops-feature">
                <div><strong>Allow sign-in</strong><p>The user can sign in to the admin portal.</p></div>
                <input type="hidden" name="disabled" value={enabled ? "0" : "on"} />
                <label className="ops-toggle-row"><span>{enabled ? "On" : "Off"}</span><span className="ops-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span /></span></label>
              </div>
              <div className="ops-card">
                <strong>Effective access</strong>
                {summary.map((item) => <p key={item.title}>{item.title}. {item.detail}</p>)}
              </div>
              <div>
                <strong>Password</strong>
                <p className="ops-muted">{creating ? "Set a password of at least 10 characters." : "The saved password stays until it is replaced."}</p>
                {replacePassword ? <label>New password <input name="password" type="password" minLength={10} autoComplete="new-password" required={creating} /></label> : <button type="button" className="btn btn-secondary" onClick={() => setReplacePassword(true)}>Change password</button>}
              </div>
              <div className="ops-inline">
                <button type="button" className="btn btn-secondary" onClick={() => choose(current || "new")}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => setReview(true)}>Review & save</button>
              </div>
              {review ? (
                <div className="ops-banner">
                  <p>{creating ? `Create ${accountRole === "super_admin" ? "a super admin" : "a staff"} account for ${name} (${email}).` : `${current?.name} → ${name}. ${current?.role === "super_admin" ? "Super admin" : "Staff"} → ${accountRole === "super_admin" ? "Super admin" : "Staff"}. Sign-in ${enabled ? "on" : "off"}.`}</p>
                  <p>{replacePassword ? "The password will be replaced." : "The saved password will not change."}</p>
                  {current && !enabled && current.id === actorId ? <p>You cannot turn off the account you are signed in with.</p> : null}
                  {current?.role === "super_admin" && (!enabled || accountRole !== "super_admin") && remainingSupers < 1 ? <p>Keep at least one super admin who can sign in.</p> : null}
                  <div className="ops-inline">
                    <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
                    <button className="btn btn-primary" type="submit">{creating ? "Create admin user" : "Save admin user"}</button>
                  </div>
                </div>
              ) : null}
            </form>
          )}
        </aside>
      ) : null}
    </div>
  );
}
