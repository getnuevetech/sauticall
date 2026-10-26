"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "80px auto", padding: 24 }}>
          <h1>This page could not be loaded.</h1>
          <p>The page stopped while it was being built. Try the page again.</p>
          {error.digest ? <p>Reference {error.digest}</p> : null}
          <button type="button" onClick={() => reset()}>Try again</button>
        </main>
      </body>
    </html>
  );
}
