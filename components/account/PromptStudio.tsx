"use client";

import { useRef, useState } from "react";

export function PromptStudio({
  summary,
  instructions,
  summaryMax,
  instructionMax,
  tokens,
  defaultInstructions,
}: {
  summary: string;
  instructions: string;
  summaryMax: number;
  instructionMax: number;
  tokens: { id: string; label: string }[];
  defaultInstructions: string;
}) {
  const [summaryText, setSummaryText] = useState(summary);
  const [text, setText] = useState(instructions);
  const [dirty, setDirty] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  function insert(token: string) {
    if (!token) return;
    const snippet = `{{${token}}}`;
    const field = box.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${snippet}${text.slice(end)}`.slice(0, instructionMax);
    setText(next);
    setDirty(true);
  }
  return (
    <>
      <label className="ai-field">Business summary
        <textarea name="business_summary" rows={3} maxLength={summaryMax} value={summaryText} onChange={(event) => { setSummaryText(event.target.value); setDirty(true); }} />
        <small>{summaryText.length}/{summaryMax}</small>
      </label>
      <p className="ai-hint">A brief description of your business. The receptionist may use it to answer common questions.</p>
      <label className="ai-field">Customer instructions
        <textarea ref={box} name="instructions" rows={8} maxLength={instructionMax} value={text} onChange={(event) => { setText(event.target.value); setDirty(true); }} />
        <small>{text.length}/{instructionMax}</small>
      </label>
      <p className="ai-hint">Detailed instructions for how the receptionist should handle calls. Use clear, specific guidance.</p>
      <div className="ai-inline-actions">
        <label className="ai-field compact">Insert supported variable
          <select value="" onChange={(event) => { insert(event.target.value); event.target.value = ""; }}>
            <option value="">Choose a field</option>
            {tokens.map((token) => <option key={token.id} value={token.id}>{token.label}</option>)}
          </select>
        </label>
        <button className="ws-btn ghost" type="button" onClick={() => { setText(defaultInstructions); setDirty(true); }}>Restore default</button>
      </div>
      {dirty ? <p className="ai-unsaved" role="status">Unsaved changes. Save instructions to keep them. The phone route is not moved.</p> : null}
    </>
  );
}
