"use client";

import { useMemo, useState } from "react";
import { deleteAccessRole, saveAccessRole } from "@/app/admin/desk-actions";
import { accessSummary, PERMISSIONS } from "@/lib/access-catalog";

type Role = { id: number; name: string; description: string; permissions: string[]; staff: number };

const GROUP_ORDER = ["Tickets", "Team", "Customers", "Phone", "Integrations", "Website"];

export function AccessDesk({ roles, selectedId, notice }: { roles: Role[]; selectedId: string; notice: string }) {
  const [activeId, setActiveId] = useState(selectedId || (roles[0] ? String(roles[0].id) : "new"));
  const creating = activeId === "new";
  const current = roles.find((role) => String(role.id) === activeId) || (creating ? { id: 0, name: "", description: "", permissions: [], staff: 0 } : roles[0]);
  const [name, setName] = useState(current?.name || "");
  const [description, setDescription] = useState(current?.description || "");
  const [chosen, setChosen] = useState<string[]>(current?.permissions || []);
  const [review, setReview] = useState(false);
  const saved = new Set(current?.permissions || []);
  const next = new Set(chosen);
  const added = PERMISSIONS.filter((item) => next.has(item.key) && !saved.has(item.key));
  const removed = PERMISSIONS.filter((item) => saved.has(item.key) && !next.has(item.key));
  const dirty = Boolean(current) && (name !== current.name || description !== current.description || added.length > 0 || removed.length > 0);
  const changes = (name !== current?.name ? 1 : 0) + (description !== current?.description ? 1 : 0) + added.length + removed.length;
  const groups = GROUP_ORDER.filter((group) => PERMISSIONS.some((item) => item.group === group));
  const summary = useMemo(() => accessSummary(chosen), [chosen]);

  function choose(role: Role | "new") {
    const nextRole = role === "new" ? { name: "", description: "", permissions: [] as string[] } : role;
    setName(nextRole.name);
    setDescription(nextRole.description);
    setChosen(nextRole.permissions);
    setReview(false);
    const level = role === "new" ? "new" : String(role.id);
    setActiveId(level);
    window.history.replaceState(null, "", `/admin/access?level=${level}`);
  }

  if (!current) return <p>No access levels are configured.</p>;
  return (
    <div className="ops-access">
      <div>
        <p className="ops-kicker">Team & access / Access levels</p>
        <h1>Access levels</h1>
        <p>Define which admin areas staff can open.</p>
        <button className="btn btn-primary" type="button" onClick={() => choose("new")}>Add access level</button>
        <div className="ops-list">
          {roles.map((role) => (
            <button key={role.id} type="button" className="ops-card ops-choice" data-current={!creating && role.id === current?.id ? "true" : undefined} onClick={() => choose(role)}>
              <strong>{role.name}</strong>
              <small>{role.staff} staff</small>
            </button>
          ))}
        </div>
      </div>
      <form className="ops-card ops-stack" action={saveAccessRole}>
        {current.id ? <input type="hidden" name="id" value={current.id} /> : null}
        <h2>{creating ? "New access level" : "Edit access level"}</h2>
        {notice ? <p className="form-feedback">{notice}</p> : null}
        <label>Name <input name="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Description <input name="description" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <h3>Permissions</h3>
        {groups.map((group) => (
          <section key={group}>
            <p className="ops-kicker">{group}</p>
            {PERMISSIONS.filter((item) => item.group === group).map((item) => {
              const on = chosen.includes(item.key);
              return (
                <label key={item.key} className="ops-feature">
                  <span><strong>{item.label}</strong><p>{item.description}</p></span>
                  <span className="ops-toggle"><input type="checkbox" name="permissions" value={item.key} checked={on} onChange={(event) => setChosen((items) => event.target.checked ? [...items, item.key] : items.filter((key) => key !== item.key))} /><span /></span>
                </label>
              );
            })}
          </section>
        ))}
        <div className="ops-save">
          <span>{dirty ? `${changes} unsaved ${changes === 1 ? "change" : "changes"}` : "No unsaved changes"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => { setName(current.name); setDescription(current.description); setChosen(current.permissions); setReview(false); }}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => setReview(true)}>Review & save</button>
        </div>
        {review ? (
          <div className="ops-banner">
            <p>{creating ? "This creates a new access level." : `Saving changes for ${current.name}.`} Staff already assigned this level get the updated permissions.</p>
            {added.length ? <p>Turn on: {added.map((item) => item.label).join(", ")}.</p> : null}
            {removed.length ? <p>Turn off: {removed.map((item) => item.label).join(", ")}.</p> : null}
            <div className="ops-inline">
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
              <button className="btn btn-primary" type="submit">{creating ? "Create access level" : "Save access level"}</button>
            </div>
          </div>
        ) : null}
      </form>
      <aside className="ops-card ops-stack">
        <h2>Effective access</h2>
        {summary.map((item) => (
          <div key={item.title} className="ops-route">
            <strong>{item.ok ? "On" : "Off"} · {item.title}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
        <p className="ops-muted">Super admin accounts bypass access levels and keep full access to every admin area.</p>
        {current.id ? (
          <form action={deleteAccessRole}>
            <input type="hidden" name="id" value={current.id} />
            <button className="btn btn-secondary" type="submit">Delete access level</button>
            <p className="ops-muted">{current.staff ? "Move staff off this level before it can be deleted." : "No staff are assigned this level."}</p>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
