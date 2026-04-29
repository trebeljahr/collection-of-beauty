"use client";

/**
 * Full-screen overlay shown to mobile users in portrait orientation.
 * Ported from raptor-runner — same animated phone SVG, same copy
 * structure, restyled with Tailwind and the gallery's amber palette.
 *
 * Visibility is controlled by the parent (via `useNeedsRotate`) — this
 * component just renders, the parent decides when it's mounted.
 */
export function LandscapePrompt() {
  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#0a0805] text-amber-50 text-center px-8"
      aria-hidden="false"
      role="alert"
    >
      <div className="max-w-xs">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mx-auto mb-4 size-16 animate-[rotate-hint_2.5s_ease-in-out_infinite]"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
        <h2 className="text-xl font-semibold mb-2">Rotate to landscape</h2>
        <p className="text-sm text-amber-100/70 leading-relaxed">
          The gallery wants room to breathe. Please turn your device sideways to walk through it.
        </p>
      </div>

      <style>{`
        @keyframes rotate-hint {
          0%, 70%, 100% { transform: rotate(0deg); }
          40%, 50% { transform: rotate(-90deg); }
        }
      `}</style>
    </div>
  );
}
