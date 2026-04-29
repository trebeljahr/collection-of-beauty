"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Floating fullscreen toggle pill — mirrors AudioControls' look so the
 * two sit side-by-side at the corner of the 3D gallery. Tracks the
 * browser's fullscreen state directly via the `fullscreenchange` event
 * so the icon stays correct when the user exits with Escape.
 */
type Props = {
  /** Extra classes for positioning from the parent (e.g. "top-4 right-16"). */
  className?: string;
};

export function FullscreenButton({ className }: Props) {
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const sync = () => setFs(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <div className={`pointer-events-auto absolute ${className ?? ""}`}>
      <div className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-white/85 backdrop-blur">
        <button
          type="button"
          onClick={toggle}
          title={fs ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
          aria-pressed={fs}
          className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/15"
        >
          {fs ? <CompressIcon /> : <ExpandIcon />}
        </button>
      </div>
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function CompressIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="M14 10l7-7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}
