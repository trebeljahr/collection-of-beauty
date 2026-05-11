"use client";

// Last-resort error boundary. Catches errors thrown by the root layout
// itself (where error.tsx can't run because there's no layout above it
// to host the boundary). global-error.tsx must render its own <html>
// and <body>, since Next's default chrome is unavailable when the
// root layout has crashed.
//
// Kept intentionally minimal — no Tailwind classes, no shared
// components, no imports that could themselves throw. Inline styles
// only, so a CSS pipeline failure can't take the recovery UI down too.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0a0805",
          color: "#f5efe6",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "1.5rem" }}>
            The site crashed.
          </h1>
          <p style={{ marginTop: 12, opacity: 0.7, fontSize: "0.9rem" }}>
            Something went wrong at the page root. Reloading usually fixes it.
          </p>
          {error.digest && (
            <p style={{ marginTop: 8, fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.5 }}>
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #6a5e4a",
              background: "transparent",
              color: "#f5efe6",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
