"use client";

import { useState } from "react";
import { AFTER_ACTIONS } from "@/lib/ai-choices";

export function AfterHoursFields({
  action,
  target,
  targets,
}: {
  action: string;
  target: string;
  targets: { value: string; label: string }[];
}) {
  const [chosen, setChosen] = useState(AFTER_ACTIONS.some((item) => item.id === action) ? action : "message");
  return (
    <>
      <label className="ai-field">After-hours behavior
        <select name="after_action" value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {AFTER_ACTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <small>Choose what should happen outside office hours.</small>
      </label>
      <label className="ai-field">After-hours extension
        <select name="after_target" defaultValue={target} disabled={chosen !== "transfer"}>
          <option value="">No extension</option>
          {targets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <small>Select a destination only if the chosen behavior is a transfer.</small>
      </label>
      {chosen !== "transfer" ? <input type="hidden" name="after_target" value="" /> : null}
    </>
  );
}
