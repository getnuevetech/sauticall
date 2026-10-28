"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WebsiteLink } from "@/lib/admin-website";

export function WebsiteTable({ rows }: { rows: WebsiteLink[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.name} ${row.url}`.toLowerCase().includes(needle));
  }, [query, rows]);
  return (
    <section className="ap-card">
      <div className="ap-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages" aria-label="Search pages" />
      </div>
      <table className="ap-table">
        <thead>
          <tr><th>Page</th><th>URL</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.href}>
              <td>{row.name}</td>
              <td>{row.url}</td>
              <td><span className="ap-badge">Live</span></td>
              <td><Link href={row.href}>Edit page</Link></td>
            </tr>
          ))}
          {shown.length === 0 ? <tr><td colSpan={4}>No pages match that search.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}
