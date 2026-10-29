"use client";

import { useFormStatus } from "react-dom";

export function TestMailSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-secondary" type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send a test"}
    </button>
  );
}
