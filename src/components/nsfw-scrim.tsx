"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** When false, renders children unchanged — no extra wrapper, no overlay. */
  nsfw: boolean;
  /** Tailwind classes for the wrapper element. Defaults to filling the parent. */
  className?: string;
  /** Compact mode for tiny thumbnails (timeline): tighter copy, smaller icon. */
  compact?: boolean;
  children: ReactNode;
};

/**
 * Wraps an image with the blur class + a click-to-reveal overlay. Visibility
 * of the blur is driven by CSS on `html[data-nsfw-blur="1"]` (set by the
 * inline boot script in layout.tsx and by NsfwProvider), so the server-
 * rendered markup is identical regardless of user preference and there is
 * no hydration mismatch.
 *
 * Reveal state is per-component: once the user clicks reveal, that single
 * tile / detail image stays revealed for the lifetime of the wrapper.
 * Remount (route change, key flip) re-blurs.
 */
export function NsfwScrim({ nsfw, className, compact, children }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!nsfw) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  return (
    <div
      className={cn("nsfw-scrim relative h-full w-full", className)}
      data-revealed={revealed ? "true" : undefined}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }}
        aria-label="Reveal sensitive work"
        className={cn(
          "nsfw-reveal absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 bg-black/30 text-white transition-colors hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
          compact ? "text-[10px]" : "text-xs",
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={compact ? 16 : 22}
          height={compact ? 16 : 22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="font-medium">{compact ? "Reveal" : "Click to reveal"}</span>
        {!compact && <span className="opacity-80">Sensitive content</span>}
      </button>
    </div>
  );
}
