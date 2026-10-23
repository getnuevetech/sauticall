"use client";

import { useState } from "react";

export function MediaForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="contact-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const response = await fetch("/api/media", { method: "POST", body: new FormData(event.currentTarget) });
        const payload = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !payload.url) setError(payload.error || "That picture could not be saved.");
        else setUrl(payload.url);
      }}
    >
      <label>Picture <input name="file" type="file" accept="image/*" required /></label>
      <label>Words that describe the picture <input name="alt" placeholder="Company logo" /></label>
      <button className="btn btn-primary" type="submit">Upload</button>
      {url ? <p>Saved. Copy this address: {url}</p> : null}
      {error ? <div className="form-feedback">{error}</div> : null}
    </form>
  );
}
