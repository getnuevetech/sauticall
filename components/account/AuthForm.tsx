"use client";

import { useActionState } from "react";
import { useState } from "react";

type FormState = { error: string } | null;

export function AuthForm({
  action,
  submit,
  fields,
  extra,
  className = "contact-form",
  submitClassName = "btn btn-primary",
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState | void>;
  submit: string;
  fields: { name: string; label: string; type?: string; placeholder?: string; optional?: boolean; maxLength?: number }[];
  extra?: React.ReactNode;
  className?: string;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action as (previous: FormState, formData: FormData) => Promise<FormState>,
    null,
  );
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const waiting = submit.startsWith("Create") ? "Creating account…" : submit.startsWith("Sign") ? "Signing in…" : "Please wait…";
  return (
    <form className={className} action={formAction}>
      {fields.map((field) => (
        <label key={field.name}>
          {field.label}{field.optional ? " (optional)" : ""}
          {field.type === "password" ? (
            <span className="pub-pass">
              <input name={field.name} type={shown[field.name] ? "text" : "password"} placeholder={field.placeholder} autoComplete={submit.startsWith("Create") ? "new-password" : "current-password"} required />
              <button type="button" onClick={() => setShown((current) => ({ ...current, [field.name]: !current[field.name] }))}>{shown[field.name] ? "Hide" : "Show"}</button>
            </span>
          ) : (
            <input name={field.name} type={field.type || "text"} placeholder={field.placeholder} autoComplete={field.name === "business" ? "organization" : field.type === "email" ? "username" : field.type === "tel" ? "tel" : field.name === "name" ? "name" : undefined} maxLength={field.maxLength} required={!field.optional} />
          )}
        </label>
      ))}
      {extra}
      <button className={submitClassName} type="submit" disabled={pending} aria-busy={pending}>{pending ? waiting : submit}</button>
      {state?.error ? <div className="form-feedback form-error" role="alert">{state.error}</div> : null}
    </form>
  );
}
