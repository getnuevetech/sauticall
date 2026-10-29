"use client";

import { useState } from "react";
import { revealSip } from "@/app/admin/actions";

export function CompanyJump({ companies, current }: { companies: { id: number; name: string }[]; current: number }) {
  return (
    <label className="ops-jump">
      Change company
      <select aria-label="Change company" value={current} onChange={(event) => { window.location.href = `/admin/phone/${event.target.value}`; }}>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </label>
  );
}

export function ConfirmRemove({ action, id, company }: { action: (formData: FormData) => void | Promise<void>; id: number; company: number }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button className="btn btn-danger" type="button" onClick={() => setOpen(true)}>Remove from phone system</button>;
  }
  return (
    <div className="ap-modal-scrim">
      <form action={action} className="ap-modal">
        <h3>Remove from phone system</h3>
        <p>This is one action. The person stays in SautiCall, and the phone-system record is removed. The name, email, and extension remain in this company.</p>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="company" value={company} />
        <div className="ap-modal-actions">
          <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-danger" type="submit">Remove from phone system</button>
        </div>
      </form>
    </div>
  );
}

export function SipReveal({ company, label, masked, which }: { company: number; label: string; masked: string; which: "user" | "pass" }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function show() {
    setPending(true);
    const result = await revealSip(company, which);
    setPending(false);
    if (!result.ok) setError(result.message);
    else {
      setError("");
      setValue(result.value);
    }
  }
  return (
    <div className="ops-secret">
      <span>{label}</span>
      <strong>{value || masked || "Not saved"}</strong>
      {masked ? (
        value
          ? <button type="button" onClick={() => setValue("")}>Hide</button>
          : <button type="button" onClick={show} disabled={pending}>{pending ? "Checking" : "Reveal"}</button>
      ) : null}
      {error ? <small>{error}</small> : null}
    </div>
  );
}
