"use client";

import { useState } from "react";
import { PROMPT_TEMPLATES } from "@/lib/ai-choices";

export function InstructionScript({ instructions }: { instructions: string }) {
  const [text, setText] = useState(instructions);
  const [choice, setChoice] = useState("");
  return (
    <>
      <label>Instruction template
        <select
          name="instruction_template"
          value={choice}
          onChange={(event) => {
            const id = event.target.value;
            setChoice(id);
            const found = PROMPT_TEMPLATES.find((template) => template.id === id);
            if (found?.text) setText(found.text);
          }}
        >
          <option value="">Keep the instructions below</option>
          {PROMPT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
        </select>
      </label>
      <label>Instructions
        <textarea name="instructions" rows={8} value={text} onChange={(event) => { setChoice(""); setText(event.target.value); }} />
      </label>
      <p>Choosing Receptionist, General business, or After hours fills the instructions box. Save to keep that script.</p>
    </>
  );
}
