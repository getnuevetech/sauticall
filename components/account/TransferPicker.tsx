"use client";

import { useMemo, useState } from "react";

export function TransferPicker({
  targets,
  selected,
}: {
  targets: { value: string; name: string; kind: string }[];
  selected: string[];
}) {
  const initial = useMemo(() => new Set(selected), [selected]);
  const [picked, setPicked] = useState(initial);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  return (
    <div className="ai-transfer-table">
      <label className="ai-search">Search extensions or groups
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search extensions or groups..." />
      </label>
      <p className="ai-hint">Only selected destinations in this workspace may receive a transfer.</p>
      {targets.length === 0 ? <p>No extension or ring group is on this account yet. Add a person under Phone, then choose who this receptionist may transfer to.</p> : (
        <table>
          <thead>
            <tr><th></th><th>Name</th><th>Type</th><th>Extension</th></tr>
          </thead>
          <tbody>
            {targets.map((target) => {
              const visible = !needle || `${target.name} ${target.kind} ${target.value}`.toLowerCase().includes(needle);
              return (
                <tr key={target.value} hidden={!visible}>
                  <td>
                    <input
                      type="checkbox"
                      name="transfers"
                      value={target.value}
                      checked={picked.has(target.value)}
                      onChange={(event) => {
                        const next = new Set(picked);
                        if (event.target.checked) next.add(target.value);
                        else next.delete(target.value);
                        setPicked(next);
                      }}
                    />
                  </td>
                  <td>{target.name}</td>
                  <td>{target.kind}</td>
                  <td>{target.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
