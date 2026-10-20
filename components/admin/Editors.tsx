"use client";

import { useState } from "react";
import { saveDocument, saveGateway } from "@/app/admin/actions";

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };

function setPath(root: Json, path: (string | number)[], next: Json): Json {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    return root.map((item, index) => (index === head ? setPath(item, rest, next) : item));
  }
  if (root && typeof root === "object") {
    return { ...root, [String(head)]: setPath((root as { [key: string]: Json })[String(head)], rest, next) };
  }
  return next;
}

function Field({ value, path, onChange }: { value: Json; path: (string | number)[]; onChange: (path: (string | number)[], next: Json) => void }) {
  const label = path.length ? String(path[path.length - 1]) : "value";
  if (typeof value === "string" || typeof value === "number") {
    const long = typeof value === "string" && value.length > 90;
    return (
      <label>
        {label}
        {long ? (
          <textarea rows={4} value={String(value)} onChange={(event) => onChange(path, event.target.value)} />
        ) : (
          <input value={String(value)} onChange={(event) => onChange(path, typeof value === "number" ? Number(event.target.value) : event.target.value)} />
        )}
      </label>
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className="check-option">
        <input type="checkbox" checked={value} onChange={(event) => onChange(path, event.target.checked)} /> {label}
      </label>
    );
  }
  if (Array.isArray(value)) {
    return (
      <fieldset>
        <legend>{label}</legend>
        {value.map((item, index) => <Field key={`${label}-${index}`} value={item} path={[...path, index]} onChange={onChange} />)}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const blank = value[0] && typeof value[0] === "object" ? JSON.parse(JSON.stringify(value[0])) : "";
            onChange(path, [...value, blank]);
          }}
        >
          Add item
        </button>
      </fieldset>
    );
  }
  if (value && typeof value === "object") {
    return (
      <fieldset>
        {path.length ? <legend>{label}</legend> : null}
        {Object.entries(value).map(([key, child]) => <Field key={key} value={child as Json} path={[...path, key]} onChange={onChange} />)}
      </fieldset>
    );
  }
  return null;
}

export function DocumentEditor({ docKey, initial }: { docKey: string; initial: unknown }) {
  const [value, setValue] = useState<Json>(initial as Json);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="contact-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          await saveDocument(docKey, JSON.stringify(value));
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save.");
        }
      }}
    >
      <Field value={value} path={[]} onChange={(path, next) => setValue((current) => setPath(current, path, next))} />
      <button className="btn btn-primary" type="submit">Save</button>
      {saved ? <div className="form-feedback">Saved.</div> : null}
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}

export function GatewayForm({ gateway }: { gateway?: { id: number; name: string; provider_key: string; public_label: string; enabled: number; priority: number; mode: string; currencies: string; secret_ref: string } }) {
  const [error, setError] = useState("");
  return (
    <form
      className="contact-form"
      action={async (formData) => {
        const result = await saveGateway(formData);
        if (result?.error) setError(result.error);
      }}
    >
      {gateway ? <input type="hidden" name="id" value={gateway.id} /> : null}
      <label>Name <input name="name" defaultValue={gateway?.name || ""} required /></label>
      <label>Provider key <input name="provider_key" defaultValue={gateway?.provider_key || ""} placeholder="stripe" required /></label>
      <label>Public label <input name="public_label" defaultValue={gateway?.public_label || ""} required /></label>
      <label>Priority <input name="priority" type="number" defaultValue={gateway?.priority ?? 100} /></label>
      <label>Currencies <input name="currencies" defaultValue={gateway?.currencies || "USD"} /></label>
      <label>Secret reference <input name="secret_ref" defaultValue={gateway?.secret_ref || ""} placeholder="vault key, not the secret itself" /></label>
      <label>Mode
        <select name="mode" defaultValue={gateway?.mode || "test"}>
          <option value="test">test</option>
          <option value="live">live</option>
        </select>
      </label>
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={gateway ? gateway.enabled === 1 : true} /> Enabled</label>
      <button className="btn btn-primary" type="submit">{gateway ? "Update gateway" : "Add gateway"}</button>
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}
