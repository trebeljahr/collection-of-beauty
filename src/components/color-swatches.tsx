"use client";

import { COLOR_BUCKETS, type ColorBucketId } from "@/lib/color-buckets.mjs";
import { cn } from "@/lib/utils";

type Props = {
  /** Currently active family, or "" for unfiltered. */
  value: ColorBucketId | "";
  onChange: (next: ColorBucketId | "") => void;
  /** Works per family, for the tooltip / screen-reader label. Optional —
   *  the strip renders fine without it, just without the numbers. */
  counts?: Readonly<Partial<Record<ColorBucketId, number>>>;
  className?: string;
};

/** Swatch strip for filtering the grid by colour family.
 *
 *  Toggle buttons in a plain group, not an ARIA radiogroup: radio roles
 *  make screen readers promise arrow-key traversal, which only exists if
 *  you hand-roll roving tabindex, and a filter this small doesn't earn
 *  that machinery. `aria-pressed` describes what the control actually
 *  does, and every swatch stays reachable with Tab.
 *
 *  Each swatch is a real <button> so focus ring, hit area, and hover come
 *  from the platform rather than being reimplemented on an SVG path.
 *  Clicking the active swatch clears the filter — the gesture people try
 *  first — and the "All" chip is there for discoverability and for anyone
 *  who doesn't.
 */
export function ColorSwatches({ value, onChange, counts, className }: Props) {
  return (
    <div
      role="group"
      aria-label="Filter by colour"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <button
        type="button"
        aria-pressed={value === ""}
        onClick={() => onChange("")}
        className={cn(
          "h-7 rounded-full border px-2.5 font-medium text-xs transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          value === ""
            ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
            : "border-[var(--border)] bg-transparent hover:bg-[var(--muted)]",
        )}
      >
        All
      </button>
      {COLOR_BUCKETS.map((bucket) => {
        const count = counts?.[bucket.id];
        const active = value === bucket.id;
        return (
          <button
            key={bucket.id}
            type="button"
            aria-pressed={active}
            // The swatch carries no text, so the accessible name has to say
            // both what it is and how much is behind it.
            aria-label={
              count === undefined
                ? bucket.label
                : `${bucket.label}, ${count} work${count === 1 ? "" : "s"}`
            }
            title={count === undefined ? bucket.label : `${bucket.label} · ${count}`}
            onClick={() => onChange(active ? "" : bucket.id)}
            className={cn(
              "size-7 rounded-full transition-transform",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
              // A plain hairline keeps the pale swatches from vanishing into
              // a light background without tinting the colour itself.
              "ring-1 ring-black/15 ring-inset",
              active
                ? "scale-110 outline-2 outline-[var(--foreground)] outline-offset-2"
                : "hover:scale-110",
            )}
            style={{ backgroundColor: bucket.swatch }}
          />
        );
      })}
    </div>
  );
}
