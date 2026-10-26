"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  const waiting = label.startsWith("Create") ? "Creating account…" : label.startsWith("Sign") ? "Signing in…" : "Please wait…";
  return <button className={className} type="submit" disabled={pending} aria-busy={pending}>{pending ? waiting : label}</button>;
}

export function AuthForm({
  action,
  submit,
  fields,
  extra,
  className = "contact-form",
  submitClassName = "btn btn-primary",
}: {
  action: (formData: FormData) => Promise<{ error: string } | void>;
  submit: string;
  fields: { name: string; label: string; type?: string; placeholder?: string }[];
  extra?: React.ReactNode;
  className?: string;
  submitClassName?: string;
}) {
  const [error, setError] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  return (
    <form
      className={className}
      action={async (formData) => {
        const result = await action(formData);
        if (result?.error) setError(result.error);
      }}
    >
      {fields.map((field) => (
        <label key={field.name}>
          {field.label}
          {field.type === "password" ? (
            <span className="pub-pass">
              <input name={field.name} type={shown[field.name] ? "text" : "password"} placeholder={field.placeholder} required />
              <button type="button" onClick={() => setShown((current) => ({ ...current, [field.name]: !current[field.name] }))}>{shown[field.name] ? "Hide" : "Show"}</button>
            </span>
          ) : (
            <input name={field.name} type={field.type || "text"} placeholder={field.placeholder} required />
          )}
        </label>
      ))}
      {extra}
      <SubmitButton label={submit} className={submitClassName} />
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}
