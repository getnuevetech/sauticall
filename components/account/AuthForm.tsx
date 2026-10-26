"use client";

import { useState } from "react";

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
          <input name={field.name} type={field.type || "text"} placeholder={field.placeholder} required />
        </label>
      ))}
      {extra}
      <button className={submitClassName} type="submit">{submit}</button>
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}
