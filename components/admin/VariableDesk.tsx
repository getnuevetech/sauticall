"use client";

import { useState } from "react";
import { saveLineVariables } from "@/app/admin/actions";
import { audienceLabel, precedenceNote, variableField, variableScope, variableValueLabel, type Audience, type LineVariable } from "@/lib/line-variables";

export function VariableDesk({ variables, selectedKey }: { variables: LineVariable[]; selectedKey: string }) {
  const [openKey, setOpenKey] = useState(selectedKey);
  const selected = variables.find((item) => item.key === openKey) || variables[0];
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(selected?.adminValue || "");
  const [audience, setAudience] = useState<Audience>(selected?.audience || "admin");
  const [review, setReview] = useState(false);
  const needle = query.trim().toLowerCase();
  const visible = variables.filter((item) => !needle || `${item.label} ${item.key}`.toLowerCase().includes(needle));
  const dirty = Boolean(selected) && (value !== selected.adminValue || audience !== selected.audience);

  function choose(item: LineVariable) {
    setOpenKey(item.key);
    setValue(item.adminValue);
    setAudience(item.audience);
    setReview(false);
  }

  if (!selected) return <p>No line variables are configured.</p>;
  const draft = { ...selected, adminValue: value, audience };
  const choices = selected.key === "lock_international"
    ? [{ value: "", label: "Not set" }, { value: "0", label: "Off" }, { value: "1", label: "On" }]
    : [];
  if (selected.key === "lock_international" && value && !choices.some((choice) => choice.value === value)) choices.push({ value, label: value });

  return (
    <div className="ops">
      <div>
        <p className="ops-kicker">Integrations / Line variables</p>
        <h1>Line variables</h1>
        <p>Defaults and value ownership for new customer line accounts.</p>
        <form className="ops-toolbar" onSubmit={(event) => event.preventDefault()}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search variables" aria-label="Search variables" />
        </form>
        {visible.length === 0 ? (
          <section className="ops-empty">
            <h2>No matching variables</h2>
            <p>No variables match this search.</p>
          </section>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Variable</th><th>Team value</th><th>Who can set</th><th></th></tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.key} data-current={item.key === selected.key ? "true" : undefined}>
                    <td><strong>{item.label}</strong></td>
                    <td>{variableValueLabel(item)}</td>
                    <td>{audienceLabel(item.audience)}</td>
                    <td><button type="button" className={`btn ${item.key === selected.key ? "btn-primary" : "btn-secondary"}`} onClick={() => choose(item)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <aside className="ops-drawer">
        <h2>Edit variable</h2>
        <p className="ops-kicker">{selected.label}</p>
        <p>{selected.detail}</p>
        <form action={saveLineVariables} className="ops-stack">
          <input type="hidden" name={`value_${selected.key}`} value={value} />
          <input type="hidden" name={`audience_${selected.key}`} value={audience} />
          {selected.key === "lock_international" ? (
            <label>Team value
              <select value={value} onChange={(event) => setValue(event.target.value)}>
                {choices.map((choice) => <option key={choice.label} value={choice.value}>{choice.label}</option>)}
              </select>
            </label>
          ) : selected.kind === "days" ? (
            <label>Team value
              <span className="ops-inline">
                <input type="number" min={0} max={365} value={value} placeholder="Not set" onChange={(event) => setValue(event.target.value)} />
                <span className="ops-badge">days</span>
              </span>
            </label>
          ) : (
            <label>Team value <input value={value} placeholder="Not set" onChange={(event) => setValue(event.target.value)} /></label>
          )}
          <p className="ops-muted">{selected.kind === "days" ? "A blank value is not set. Zero stays zero and is not treated as blank." : selected.key === "lock_international" ? "Not set, Off, and On are different values. Off is stored as 0." : "A blank value is not set and does not override the phone-connection default."}</p>
          <label>Who can set this
            <select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}>
              <option value="admin">Team only</option>
              <option value="customer">Customer</option>
              <option value="both">Both, team value wins</option>
            </select>
          </label>
          <div className="ops-banner">
            <strong>Value precedence</strong>
            <p>{precedenceNote(draft)}</p>
          </div>
          <div className="ops-card">
            <strong>Scope</strong>
            <p>{variableScope(selected.key)}</p>
          </div>
          <details className="ops-details">
            <summary>Technical mapping</summary>
            <p>Field {variableField(selected.key)}. Blank, 0, and Off stay distinct. This save does not create a line account.</p>
          </details>
          <div className="ops-inline">
            <button type="button" className="btn btn-secondary" onClick={() => { setValue(selected.adminValue); setAudience(selected.audience); setReview(false); }}>Discard</button>
            <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => setReview(true)}>Review & save</button>
          </div>
          {review ? (
            <div className="ops-banner">
              <p>{selected.label}: {variableValueLabel(selected)} → {variableValueLabel(draft)}. {audienceLabel(selected.audience)} → {audienceLabel(audience)}.</p>
              <p>{precedenceNote(draft)}</p>
              <p>{variableScope(selected.key)}</p>
              <div className="ops-inline">
                <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
                <button className="btn btn-primary" type="submit">Save variable</button>
              </div>
            </div>
          ) : null}
        </form>
      </aside>
    </div>
  );
}
