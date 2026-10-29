"use client";

import { useState } from "react";

export function SecretField({ name, label, stored, hint }: { name: string; label: string; stored: boolean; hint?: string }) {
  const [open, setOpen] = useState(!stored);
  if (!open) {
    return (
      <div className="ops-feature">
        <div>
          <strong>{label}</strong>
          <p>Stored. Write-only and cannot be viewed.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>Replace</button>
      </div>
    );
  }
  return (
    <label>{label}
      <input name={name} type="password" placeholder={stored ? "Leave blank to keep the saved secret" : hint || ""} autoComplete="new-password" />
    </label>
  );
}
