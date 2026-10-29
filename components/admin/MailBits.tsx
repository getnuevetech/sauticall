"use client";

import { useState } from "react";
import { rotateMailSecret } from "@/app/admin/desk-actions";

export function MailPassword({ stored }: { stored: boolean }) {
  const [open, setOpen] = useState(!stored);
  if (!open) {
    return (
      <div className="ops-feature">
        <div><strong>Password</strong><p>Stored. It cannot be viewed.</p></div>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>Replace</button>
      </div>
    );
  }
  return <label>Password <input name="smtp_pass" type="password" placeholder={stored ? "Leave blank to keep the saved password" : ""} autoComplete="new-password" /></label>;
}

export function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function InboundSecret() {
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="ops-stack">
      <label>Authorization secret
        <input readOnly value={secret || "Stored. Restricted access."} />
      </label>
      {secret ? <p className="ops-muted">Copy this secret into the inbound email provider. It will not be shown again after you leave this page.</p> : <p className="ops-muted">The saved secret is hidden. Rotating it replaces the value the provider must send.</p>}
      <div className="ops-inline">
        {secret ? <CopyText value={secret} /> : null}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void rotateMailSecret().then((result) => {
              setSecret(result.secret);
              setPending(false);
            });
          }}
        >
          {pending ? "Rotating…" : "Rotate secret"}
        </button>
      </div>
    </div>
  );
}
