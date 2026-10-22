"use client";

import { useState } from "react";

export default function MediaPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <span className="eyebrow">Images</span>
      <h2>Upload a picture</h2>
      <p>After it saves, copy the address into Logo image address under Colors and font.</p>
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
    </>
  );
}
