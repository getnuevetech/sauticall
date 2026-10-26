"use client";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>This page could not be loaded.</h1>
      <p>The page stopped while it was being built. Your account is still signed in. Try the page again.</p>
      {error.digest ? <p>Reference {error.digest}</p> : null}
      <button type="button" onClick={() => reset()}>Try again</button>
    </main>
  );
}
