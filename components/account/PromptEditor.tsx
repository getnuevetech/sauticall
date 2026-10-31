"use client";

import { useState } from "react";
import { restoreAccountPromptForm, saveAccountPromptForm } from "@/app/account/ai/actions";

export function PromptEditor({
  feature,
  next,
  saved,
  template,
  guidance,
  label,
}: {
  feature: string;
  next: string;
  saved: string;
  template: string;
  guidance: string[];
  label: string;
}) {
  const [text, setText] = useState(saved);
  const restoreId = `restore-${feature}`;
  return (
    <>
    <form id={restoreId} action={restoreAccountPromptForm}>
      <input type="hidden" name="feature" value={feature} />
      <input type="hidden" name="next" value={next} />
    </form>
    <form action={saveAccountPromptForm}>
      <input type="hidden" name="feature" value={feature} />
      <input type="hidden" name="next" value={next} />
      <label>
        Starting template
        <select
          value=""
          onChange={(event) => {
            if (event.target.value === "template") setText(template);
            event.target.value = "";
          }}
        >
          <option value="">Choose a starting point</option>
          <option value="template">Load the starting template</option>
        </select>
      </label>
      <ul className="ai-guide">
        {guidance.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <label>
        {label}
        <textarea name="instructions" rows={12} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <p>Text preview. This does not place a call or change routing.</p>
      <div className="ai-preview">{text.trim() || "Nothing to preview yet."}</div>
      <div className="ai-form-actions">
        <button className="ws-btn primary" type="submit">Save changes</button>
        <button className="ws-btn ghost" type="button" onClick={() => setText(saved)}>Discard</button>
        <button className="ws-btn ghost" type="submit" form={restoreId}>Restore default</button>
      </div>
      <p>Restore default stores the starting template for this account. It does not place a call or change routing. Discard drops unsaved typing.</p>
    </form>
    </>
  );
}
