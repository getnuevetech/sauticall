"use client";

import { useState } from "react";
import { saveDocument, saveGateway } from "@/app/admin/actions";
import { choicesFor, currencyChoices, providerChoices, withCurrent } from "@/lib/admin-choices";
import { fieldLabel } from "@/lib/admin-labels";

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

function itemTitle(value: Json, index: number) {
  if (typeof value === "string" && value.trim()) return value.length > 42 ? `${value.slice(0, 42)}…` : value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as { [key: string]: Json };
    for (const key of ["label", "name", "title", "q"]) {
      if (typeof record[key] === "string" && record[key]) return String(record[key]);
    }
  }
  return `Item ${index + 1}`;
}

function blankLike(sample: Json): Json {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === "object") {
    const next: { [key: string]: Json } = {};
    for (const [key, child] of Object.entries(sample)) next[key] = blankLike(child);
    return next;
  }
  if (typeof sample === "number") return 0;
  if (typeof sample === "boolean") return false;
  return "";
}

function Field({ docKey, value, path, onChange }: { docKey: string; value: Json; path: (string | number)[]; onChange: (path: (string | number)[], next: Json) => void }) {
  const last = path.length ? path[path.length - 1] : "";
  const indexed = typeof last === "number";
  const raw = indexed ? "" : String(last);
  const label = raw ? fieldLabel(raw, docKey) : "";
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    const options = typeof value === "string" ? choicesFor(docKey, raw) : null;
    if (options) {
      const list = withCurrent(options, text);
      return (
        <label>
          {label}
          <select value={text} onChange={(event) => onChange(path, event.target.value)}>
            {list.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      );
    }
    if (docKey === "theme" && typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
      return (
        <label>
          {label}
          <input type="color" value={value} onChange={(event) => onChange(path, event.target.value)} />
        </label>
      );
    }
    const long = typeof value === "string" && value.length > 90;
    return (
      <label>
        {label}
        {long ? (
          <textarea rows={4} value={text} onChange={(event) => onChange(path, event.target.value)} />
        ) : (
          <input value={text} onChange={(event) => onChange(path, typeof value === "number" ? Number(event.target.value) : event.target.value)} />
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
        {label ? <legend>{label}</legend> : null}
        {value.map((item, index) => (
          <fieldset key={`${raw}-${index}`}>
            <legend>{itemTitle(item, index)}</legend>
            <Field docKey={docKey} value={item} path={[...path, index]} onChange={onChange} />
            {value.length > 1 ? (
              <button type="button" className="btn btn-secondary" onClick={() => onChange(path, value.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </button>
            ) : null}
          </fieldset>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => onChange(path, [...value, value.length ? blankLike(value[0]) : ""])}>
          Add another
        </button>
      </fieldset>
    );
  }
  if (value && typeof value === "object") {
    const children = Object.entries(value).map(([key, child]) => <Field key={key} docKey={docKey} value={child as Json} path={[...path, key]} onChange={onChange} />);
    if (indexed || path.length === 0) return <>{children}</>;
    return (
      <fieldset>
        <legend>{label}</legend>
        {children}
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
      <Field docKey={docKey} value={value} path={[]} onChange={(path, next) => setValue((current) => setPath(current, path, next))} />
      <button className="btn btn-primary" type="submit">Save changes</button>
      {saved ? <div className="form-feedback">Saved.</div> : null}
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}

export function GatewayForm({ gateway }: { gateway?: { id: number; name: string; provider_key: string; public_label: string; enabled: number; priority: number; mode: string; currencies: string; config: { publishable_key: string; client_id: string; application_id: string; location_id: string }; hasSecret: boolean; hasWebhook: boolean } }) {
  const [error, setError] = useState("");
  const [provider, setProvider] = useState(gateway?.provider_key || "stripe");
  const savedHere = gateway?.provider_key === provider;
  const secretHint = savedHere && gateway?.hasSecret ? "Saved. Leave blank to keep it." : "Paste the secret";
  return (
    <form
      className="contact-form"
      action={async (formData) => {
        const result = await saveGateway(formData);
        if (result?.error) setError(result.error);
      }}
    >
      {gateway ? <input type="hidden" name="id" value={gateway.id} /> : null}
      <label>Name for your team <input name="name" defaultValue={gateway?.name || ""} required /></label>
      <label>Payment company
        <select name="provider_key" value={provider} onChange={(event) => setProvider(event.target.value)} required>
          {withCurrent(providerChoices, provider).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>Name customers see <input name="public_label" defaultValue={gateway?.public_label || ""} required /></label>
      <label>Order on the page, 1 shows first <input name="priority" type="number" defaultValue={gateway?.priority ?? 100} /></label>
      <label>Money
        <select name="currencies" defaultValue={gateway?.currencies || "USD"}>
          {withCurrent(currencyChoices, gateway?.currencies || "USD").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>Payments
        <select name="mode" defaultValue={gateway?.mode || "test"}>
          <option value="test">Practice only</option>
          <option value="live">Real payments</option>
        </select>
      </label>
      {provider === "stripe" ? (
        <>
          <p>From Stripe → Developers → API keys. Practice only uses the test keys. Real payments uses the live keys. If you add a webhook, point it at /api/pay/stripe on this site.</p>
          <label>Publishable key <input name="publishable_key" defaultValue={savedHere ? gateway?.config.publishable_key || "" : ""} placeholder="pk_test_ or pk_live_" autoComplete="off" /></label>
          <label>Secret key <input name="secret_key" type="password" placeholder={secretHint} autoComplete="new-password" /></label>
          <label>Webhook signing secret <input name="webhook_secret" type="password" placeholder={savedHere && gateway?.hasWebhook ? "Saved. Leave blank to keep it." : "whsec_ optional"} autoComplete="new-password" /></label>
        </>
      ) : null}
      {provider === "paypal" ? (
        <>
          <p>From PayPal → Apps & Credentials. Practice only uses Sandbox. Real payments uses Live.</p>
          <label>Client ID <input name="client_id" defaultValue={savedHere ? gateway?.config.client_id || "" : ""} autoComplete="off" /></label>
          <label>Secret <input name="secret_key" type="password" placeholder={secretHint} autoComplete="new-password" /></label>
        </>
      ) : null}
      {provider === "square" ? (
        <>
          <p>From the Square developer console. Practice only uses Sandbox. Real payments uses Production. The location ID is in the Square account.</p>
          <label>Application ID <input name="application_id" defaultValue={savedHere ? gateway?.config.application_id || "" : ""} autoComplete="off" /></label>
          <label>Location ID <input name="location_id" defaultValue={savedHere ? gateway?.config.location_id || "" : ""} autoComplete="off" /></label>
          <label>Access token <input name="secret_key" type="password" placeholder={secretHint} autoComplete="new-password" /></label>
        </>
      ) : null}
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={gateway ? gateway.enabled === 1 : false} /> Customers can use this</label>
      <button className="btn btn-primary" type="submit">{gateway ? "Save gateway" : "Add gateway"}</button>
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}
