"use client";

import { useState } from "react";

export default function MediaPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <span className="eyebrow">IMAGES</span>
      <h2>Upload an image</h2>
      <p>Copy the path into a logo or content image field. The approved pages use drawn artwork until you set a logo.</p>
      <form
        className="contact-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const response = await fetch("/api/media", { method: "POST", body: new FormData(event.currentTarget) });
          const payload = (await response.json()) as { url?: string; error?: string };
          if (!response.ok || !payload.url) setError(payload.error || "Upload failed.");
          else setUrl(payload.url);
        }}
      >
        <label>Image <input name="file" type="file" accept="image/*" required /></label>
        <label>Alt text <input name="alt" placeholder="Description" /></label>
        <button className="btn btn-primary" type="submit">Upload</button>
        {url ? <p>Saved as {url}</p> : null}
        {error ? <div className="form-feedback">{error}</div> : null}
      </form>
    </>
  );
}
