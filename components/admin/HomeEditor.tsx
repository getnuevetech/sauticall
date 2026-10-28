"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { saveDocument } from "@/app/admin/actions";
import { fieldLabel } from "@/lib/admin-labels";
import { destinationChoices, homeSections } from "@/lib/home-sections";

function textOf(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n");
  return typeof value === "string" ? value : "";
}

export function HomeEditor({ initial }: { initial: Record<string, unknown> }) {
  const [saved, setSaved] = useState(initial);
  const [page, setPage] = useState(initial);
  const [sectionId, setSectionId] = useState("hero");
  const [narrow, setNarrow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const sections = homeSections(page);
  const section = sections.find((item) => item.id === sectionId) || sections[0];
  const dirty = JSON.stringify(page) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(key: string, value: unknown) {
    setPage((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveDocument("page.home", JSON.stringify(page));
      setSaved(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="home-editor">
      <p className="ap-note">Header and footer links are edited once under <Link href="/admin/website?tab=navigation">Navigation</Link>. The header buttons on this page are stored with the home page. Saving updates the live site.</p>
      <div className="home-editor-grid">
        <nav className="home-sections" aria-label="Page sections">
          {sections.map((item) => (
            <button key={item.id} type="button" className={item.id === section?.id ? "active" : ""} onClick={() => setSectionId(item.id)}>{item.label}</button>
          ))}
        </nav>
        <section className="ap-card home-fields">
          <h2>{section?.label}</h2>
          {section?.keys.map((key) => {
            const value = page[key];
            const label = fieldLabel(key, "page.home");
            if (Array.isArray(value)) {
              return (
                <label key={key}>{label}
                  <textarea value={textOf(value)} rows={Math.min(8, Math.max(3, value.length + 1))} onChange={(event) => update(key, event.target.value.split("\n"))} />
                </label>
              );
            }
            if (key.endsWith("Href")) {
              return (
                <label key={key}>{label}
                  <select value={typeof value === "string" ? value : ""} onChange={(event) => update(key, event.target.value)}>
                    {destinationChoices(typeof value === "string" ? value : "").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              );
            }
            const long = key.endsWith("Body") || key === "disclaimer" || key === "metaDescription" || key === "lead" || textOf(value).length > 90;
            return (
              <label key={key}>{label}
                {long ? <textarea value={textOf(value)} rows={4} onChange={(event) => update(key, event.target.value)} /> : <input value={textOf(value)} onChange={(event) => update(key, event.target.value)} />}
              </label>
            );
          })}
        </section>
        <aside className={`home-preview${narrow ? " narrow" : ""}`}>
          <div className="home-preview-bar">
            <strong>Unsaved preview</strong>
            <button type="button" className={!narrow ? "active" : ""} onClick={() => setNarrow(false)}>Desktop</button>
            <button type="button" className={narrow ? "active" : ""} onClick={() => setNarrow(true)}>Mobile</button>
          </div>
          <div className="home-preview-card">
            <p className="home-preview-kicker">{textOf(page.eyebrow)}</p>
            <h2>{textOf(page.titleLead)} <span>{textOf(page.titleAccent)}</span></h2>
            <p>{textOf(page.lead)}</p>
            <span className="home-preview-btn">{textOf(page.primaryCta) || "Button"}</span>
          </div>
          <a className="home-saved" href="/" target="_blank" rel="noreferrer">Open saved page</a>
        </aside>
      </div>
      {dirty ? (
        <div className="ap-savebar">
          <div>
            <strong>Unsaved changes</strong>
            <p>Saving updates the live home page.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setPage(saved)}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving" : "Save to live"}</button>
        </div>
      ) : null}
      {error ? <p className="form-feedback">{error}</p> : null}
    </div>
  );
}
