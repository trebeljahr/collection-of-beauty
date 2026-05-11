"use client";

// Route-level error boundary. Catches any uncaught error in the
// app/(non-root) tree — bad data shape, missing prop, runtime throw —
// and shows a recovery card instead of Next's default white screen.
// Mounted at app/error.tsx so it covers every route except the root
// layout itself (handled by global-error.tsx).
//
// `reset` re-renders the failed segment. The user gets one explicit
// retry instead of being forced to reload.

import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the browser console + (in prod) Vercel logs
    // via the framework's stderr capture. `digest` is the hashed ID
    // Next prints in server logs — useful for cross-referencing.
    console.error("[route error]", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-2xl tracking-tight">Something broke on this page.</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        Sorry — the page hit an unexpected error. Try again, or head back to the home page.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-[var(--muted-foreground)]">ref: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90"
        >
          Home
        </a>
      </div>
    </div>
  );
}
