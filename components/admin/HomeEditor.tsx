"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { saveDocument } from "@/app/admin/actions";
import { fieldLabel } from "@/lib/admin-labels";
import { destinationChoices, PAGE_PUBLIC, pagePreview, pageSections, homeValue, shownCopy, type HomeField } from "@/lib/home-sections";

function textOf(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n");
  return typeof value === "string" ? value : "";
}

function setPath(page: Record<string, unknown>, path: string[], value: unknown) {
  const next = structuredClone(page);
  let current: Record<string, unknown> = next;
  for (const key of path.slice(0, -1)) {
    const child = current[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
  return next;
}

export function HomeEditor({ initial }: { initial: Record<string, unknown> }) {
  return <PageEditor docKey="page.home" initial={initial} />;
}

export function PageEditor({ docKey, initial }: { docKey: string; initial: Record<string, unknown> }) {
  const [saved, setSaved] = useState(initial);
  const [page, setPage] = useState(initial);
  const [sectionId, setSectionId] = useState("hero");
  const [narrow, setNarrow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const sections = pageSections(docKey, page);
  const section = sections.find((item) => item.id === sectionId) || sections[0];
  const dirty = JSON.stringify(page) !== JSON.stringify(saved);
  const preview = pagePreview(docKey, page);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(path: string[], value: unknown) {
    setPage((current) => setPath(current, path, value));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveDocument(docKey, JSON.stringify(page));
      setSaved(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="home-editor">
      <p className="ap-note">Header and footer links are edited once under <Link href="/admin/website?tab=navigation">Navigation</Link>. {docKey === "page.home" ? "The header buttons on this page are stored with the home page. " : ""}{docKey === "page.pricing" ? <>Plan prices stay in <Link href="/admin/content/plans">Catalog & billing</Link>. Minute bundles stay in <Link href="/admin/content/minute_bundles">Call minute bundles</Link>. </> : null}{docKey === "page.help" ? <>Longer articles stay under <Link href="/admin/faq">FAQ articles</Link>. </> : null}Saving updates the live site.</p>
      <div className="home-editor-grid">
        <nav className="home-sections" aria-label="Page sections">
          {sections.map((item) => (
            <button key={item.id} type="button" className={item.id === section?.id ? "active" : ""} onClick={() => setSectionId(item.id)}>{item.label}</button>
          ))}
        </nav>
        <section className="ap-card home-fields">
          <h2>{section?.label}</h2>
          {section?.fields.map((field) => (
            <FieldEditor key={field.path.join(".")} page={page} field={field} onChange={update} />
          ))}
        </section>
        <aside className={`home-preview${narrow ? " narrow" : ""}`}>
          <div className="home-preview-bar">
            <strong>Unsaved preview</strong>
            <button type="button" className={!narrow ? "active" : ""} onClick={() => setNarrow(false)}>Desktop</button>
            <button type="button" className={narrow ? "active" : ""} onClick={() => setNarrow(true)}>Mobile</button>
          </div>
          <div className="home-preview-card">
            <p className="home-preview-kicker">{preview.kicker}</p>
            <h2>{preview.title} <span>{preview.accent}</span></h2>
            <p>{preview.lead}</p>
            <span className="home-preview-btn">{preview.button || "Button"}</span>
          </div>
          <a className="home-saved" href={PAGE_PUBLIC[docKey] || "/"} target="_blank" rel="noreferrer">Open saved page</a>
        </aside>
      </div>
      {dirty ? (
        <div className="ap-savebar">
          <div>
            <strong>Unsaved changes</strong>
            <p>Saving updates the live page.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setPage(saved)}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving" : "Save to live"}</button>
        </div>
      ) : null}
      {error ? <p className="form-feedback form-error" role="alert">{error}</p> : null}
    </div>
  );
}

function FieldEditor({ page, field, onChange }: { page: Record<string, unknown>; field: HomeField; onChange: (path: string[], value: unknown) => void }) {
  const value = homeValue(page, field.path);
  const label = fieldLabel(field.key, "page.home");
  if (field.kind === "lines" || (Array.isArray(value) && value.every((item) => typeof item === "string"))) {
    const lines = Array.isArray(value) ? value.map((item) => String(item ?? "")) : [];
    return (
      <label>{label}
        <textarea value={lines.join("\n")} rows={Math.min(8, Math.max(3, lines.length + 1))} onChange={(event) => onChange(field.path, event.target.value.split("\n"))} />
      </label>
    );
  }
  if (field.kind === "rows" || (Array.isArray(value) && value.every((item) => item && typeof item === "object"))) {
    const rows = Array.isArray(value) ? value as Record<string, unknown>[] : [];
    const columns = field.columns || [];
    return (
      <div className="home-rows">
        <span>{label}</span>
        {rows.map((row, index) => (
          <div className="home-row" key={`${field.key}-${index}`}>
            {columns.map((column) => {
              const cell = typeof row[column.key] === "string" ? row[column.key] as string : "";
              const cellLabel = fieldLabel(column.key, "page.home");
              return (
                <label key={column.key}>{cellLabel}
                  {column.href ? (
                    <select value={cell} onChange={(event) => onChange(field.path, rows.map((item, itemIndex) => itemIndex === index ? { ...item, [column.key]: event.target.value } : item))}>
                      {destinationChoices(cell).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  ) : column.key === "body" || column.key === "a" || cell.length > 90 ? (
                    <textarea rows={3} value={cell} onChange={(event) => onChange(field.path, rows.map((item, itemIndex) => itemIndex === index ? { ...item, [column.key]: event.target.value } : item))} />
                  ) : (
                    <input value={cell} onChange={(event) => onChange(field.path, rows.map((item, itemIndex) => itemIndex === index ? { ...item, [column.key]: event.target.value } : item))} />
                  )}
                </label>
              );
            })}
            <button type="button" className="btn btn-secondary" onClick={() => onChange(field.path, rows.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => onChange(field.path, [...rows, Object.fromEntries(columns.map((column) => [column.key, ""]))])}>Add</button>
      </div>
    );
  }
  if (typeof value === "number") {
    return (
      <label>{label}
        <input value={String(value)} onChange={(event) => onChange(field.path, Number(event.target.value))} />
      </label>
    );
  }
  if (value && typeof value === "object") {
    return <p className="ap-note">{label} stays as it was saved.</p>;
  }
  const text = textOf(shownCopy(page) && field.path[0] === "shown" && typeof value !== "string" ? page[field.key] : value);
  if (field.key.endsWith("Href")) {
    return (
      <label>{label}
        <select value={text} onChange={(event) => onChange(field.path, event.target.value)}>
          {destinationChoices(text).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    );
  }
  const long = field.key.endsWith("Body") || field.key === "disclaimer" || field.key === "metaDescription" || field.key === "lead" || field.key === "fineNote" || field.key === "heroAlt" || field.key === "aiAlt" || text.length > 90;
  return (
    <label>{label}
      {long ? <textarea value={text} rows={4} onChange={(event) => onChange(field.path, event.target.value)} /> : <input value={text} onChange={(event) => onChange(field.path, event.target.value)} />}
    </label>
  );
}
