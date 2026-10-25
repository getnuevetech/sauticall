"use client";

import { useState, type FormEvent } from "react";
import { revealAppPassword } from "@/app/account/actions";

export function AppPassword({ extensionId, needsCode }: { extensionId: number; needsCode: boolean }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await revealAppPassword(extensionId, code);
    if (result.error || !result.password) {
      setPassword("");
      setOpen(false);
      setError(result.error || "That app password is not available.");
      return;
    }
    setError("");
    setPassword(result.password);
    setOpen(true);
  }

  if (open && password) {
    return (
      <p>
        App password: {password}{" "}
        <button className="btn btn-secondary" type="button" onClick={() => { setOpen(false); setPassword(""); setCode(""); }}>Hide</button>
      </p>
    );
  }

  return (
    <form onSubmit={reveal}>
      {needsCode ? <label>Authenticator code <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label> : null}
      <button className="btn btn-secondary" type="submit">Show app password</button>
      {error ? <p>{error}</p> : null}
    </form>
  );
}
