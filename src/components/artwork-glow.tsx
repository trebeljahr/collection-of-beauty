"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

/** Registered with `@property` in globals.css, so the colour itself can
 *  transition instead of snapping. */
const GLOW_VAR = "--artwork-glow";

/** Colour of the glow that is on screen now. Prev/next on the artwork page
 *  changes the `[id]` segment, and Next.js remounts the whole page for a
 *  new segment key, glow included. A freshly inserted element has no
 *  previous colour to transition from, so the incoming glow starts from
 *  this one. Only written in effects, so the server never sees a value. */
let onScreen: { color: string } | null = null;

type Props = {
  /** `ArtworkListing.dominantColor`. Null fades the glow out. */
  color: string | null;
};

/**
 * Soft light in the work's average colour behind its frame. Place it as
 * a child of the frame, which must be `position: relative` and must not
 * create a stacking context: the glow sits at `z-index: -1`, under the
 * page's text as well as the image. Styles live in globals.css.
 */
export function ArtworkGlow({ color }: Props) {
  const target = color ?? "transparent";
  const ref = useRef<HTMLDivElement>(null);
  // The starting colour, fixed for the element's lifetime. Every change
  // after mount is written straight to the element below, so React never
  // re-renders the style and overwrites a transition that is running.
  const [initial] = useState(() => onScreen?.color ?? target);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Resolve the style once before the change. A new element has none
    // yet, and without a before-change style the browser applies the new
    // colour with no transition.
    getComputedStyle(el).getPropertyValue(GLOW_VAR);
    el.style.setProperty(GLOW_VAR, target);
    const entry = { color: target };
    onScreen = entry;
    return () => {
      // A replacement mounting in the same navigation has already read
      // the colour by now. Clear it afterwards, so a work opened later
      // from a grid doesn't fade in from a stale colour.
      setTimeout(() => {
        if (onScreen === entry) onScreen = null;
      }, 0);
    };
  }, [target]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="artwork-glow"
      style={{ [GLOW_VAR]: initial } as CSSProperties}
    />
  );
}
