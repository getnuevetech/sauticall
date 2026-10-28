"use client";

import { useEffect, useState } from "react";
import { saveDocument } from "@/app/admin/actions";
import { flagGroups, flagsDirty, mfaChanged, type FlagRecord } from "@/lib/admin-controls";

export function PlatformControls({ initial }: { initial: FlagRecord[] }) {
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(initial);
  const [tab, setTab] = useState(flagGroups(initial)[0]?.id || "access");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = flagsDirty(saved, pending);
  const groups = flagGroups(pending);
  const current = groups.find((group) => group.id === tab) || groups[0];

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setEnabled(key: string, enabled: boolean) {
    setPending((rows) => rows.map((row) => row.key === key ? { ...row, enabled } : row));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveDocument("flags", JSON.stringify(pending));
      setSaved(pending);
      setReview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const mfa = pending.find((flag) => flag.key === "auth.mfa");
  const mfaSaved = saved.find((flag) => flag.key === "auth.mfa");

  return (
    <div className="ap-settings">
      <div className="ap-tabs" role="tablist">
        {groups.map((group) => (
          <button key={group.id} type="button" role="tab" aria-selected={group.id === current?.id} className={group.id === current?.id ? "active" : ""} onClick={() => setTab(group.id)}>{group.label}</button>
        ))}
      </div>
      <section className="ap-card">
        {current?.rows.map((flag) => {
          const was = saved.find((row) => row.key === flag.key)?.enabled;
          return (
            <div key={flag.key} className="ap-row">
              <div>
                <strong>{flag.label}</strong>
                <p>{flag.description}</p>
                {flag.enabled !== was ? <span className="ap-unsaved">Unsaved</span> : null}
              </div>
              <label className="ap-switch">
                <input type="checkbox" checked={flag.enabled} onChange={(event) => setEnabled(flag.key, event.target.checked)} />
                <span>{flag.enabled ? "On" : "Off"}</span>
              </label>
            </div>
          );
        })}
      </section>
      {current?.id === "access" && mfa ? (
        <aside className="ap-side-card">
          <h2>Change details</h2>
          <p><span>Control</span> {mfa.label}</p>
          <p><span>Saved</span> {mfaSaved?.enabled ? "On" : "Off"}</p>
          <p><span>Pending</span> {mfa.enabled ? "On" : "Off"}</p>
          <p><span>Scope</span> All accounts, plus any requirement already set on one customer.</p>
        </aside>
      ) : null}
      {dirty ? (
        <div className="ap-savebar">
          <div>
            <strong>Unsaved changes</strong>
            <p>Changes apply only after saving.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => { setPending(saved); setReview(false); }}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => { if (mfaChanged(saved, pending)) setReview(true); else void save(); }}>{mfaChanged(saved, pending) ? "Review & save" : "Save changes"}</button>
        </div>
      ) : null}
      {error ? <p className="form-feedback">{error}</p> : null}
      {review && mfa && mfaSaved ? (
        <div className="ap-modal-scrim">
          <div className="ap-modal" role="dialog" aria-modal="true" aria-labelledby="mfa-review">
            <h2 id="mfa-review">Review MFA for all accounts</h2>
            <p>Saved is {mfaSaved.enabled ? "On" : "Off"}. Pending is {mfa.enabled ? "On" : "Off"}.</p>
            <p>This requires an authenticator at sign-in and before an app password is revealed. A requirement already set on one customer stays as it is. Turning this off does not remove authenticators people have already set up.</p>
            <div className="ap-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving" : "Save changes"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
