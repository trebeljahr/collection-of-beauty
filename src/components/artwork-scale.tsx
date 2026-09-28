"use client";

// Scale view on /artwork/[id]. "Show to scale" in the aside resizes the
// hero image on the left to the work's physical size and draws a
// reference object beside it: a 175 cm figure for paintings, an A4 sheet
// or a hand for plates and prints. ArtworkViewer draws the scene; this
// file holds the shared on/off state, the toggle and the drawings.
//
// No image is fetched for it: the hero is already on screen and only
// changes size.
//
// Callers must gate on `trustworthyRealSize()`. The view draws whatever
// it is given; it has no way to tell a good size from a bad one.

import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { formatCm, type RealSize, type ScaleReference } from "@/lib/real-size";
import { HAND_PATH, HAND_SHAPE, PERSON_PATH, PERSON_SHAPE } from "@/lib/scale-figures";
import { cn } from "@/lib/utils";

/** Id of the hero's stage, for the toggle's aria-controls and scroll. */
export const SCALE_STAGE_ID = "artwork-stage";

type ScaleViewState = { scaled: boolean; setScaled: (scaled: boolean) => void };

const ScaleViewContext = createContext<ScaleViewState>({
  scaled: false,
  setScaled: () => {},
});

/** The element holding both the hero and the aside, so the toggle in
 *  one can resize the image in the other. It renders that element
 *  itself, a div with `className`, which keeps the page's markup flat.
 *  Prev/next remounts the page, so every work opens at full size. */
export function ScaleViewProvider({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [scaled, setScaled] = useState(false);
  const value = useMemo(() => ({ scaled, setScaled }), [scaled]);
  return (
    <ScaleViewContext.Provider value={value}>
      <div className={className}>{children}</div>
    </ScaleViewContext.Provider>
  );
}

export function useScaleView(): boolean {
  return useContext(ScaleViewContext).scaled;
}

export function ArtworkScaleToggle({ size }: { size: RealSize }) {
  const { scaled, setScaled } = useContext(ScaleViewContext);

  const toggle = () => {
    const next = !scaled;
    setScaled(next);
    if (!next) return;
    // Below md the hero is above the aside and usually scrolled out of
    // view by the time the visitor reaches this button.
    const stage = document.getElementById(SCALE_STAGE_ID);
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (visible < r.height / 2) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stage.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
  };

  return (
    <div className="border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-lg">
          Size{" "}
          <span className="font-sans text-base tabular-nums text-[var(--muted-foreground)]">
            {formatCm(size)}
          </span>
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-controls={SCALE_STAGE_ID}
          className="-my-3 inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:my-0 sm:min-h-0"
        >
          {scaled ? "Hide scale" : "Show to scale"}
        </button>
      </div>
    </div>
  );
}

/** The reference object, scaled to its box's height and centred in its
 *  width, so the stated height ("175 cm tall") is exact. The box is the
 *  drawing's own bounding box (see scale-figures.ts), so nothing spills
 *  into the gap beside the work. */
export function ScaleReferenceDrawing({
  reference,
  style,
  className,
}: {
  reference: ScaleReference;
  style: CSSProperties;
  className?: string;
}) {
  const { widthCm: w, heightCm: h } = reference;
  const svgProps = {
    focusable: "false",
    overflow: "visible",
    className: cn("absolute", className),
    style,
  } as const;

  if (reference.kind === "a4") {
    // Sheet outline with a folded top corner, so it reads as paper rather
    // than as a second, blank work.
    const fold = Math.min(w, h) * 0.12;
    return (
      <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} {...svgProps}>
        <path
          d={`M0 0H${w - fold}L${w} ${fold}V${h}H0Z`}
          className="fill-[var(--card)]"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M${w - fold} 0V${fold}H${w}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const shape = reference.kind === "person" ? PERSON_SHAPE : HAND_SHAPE;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      preserveAspectRatio="xMidYMax meet"
      {...svgProps}
    >
      {/* A silhouette is a solid mass beside the work; lighter than the
          sheet's outline so it does not outweigh the painting. */}
      <path
        d={reference.kind === "person" ? PERSON_PATH : HAND_PATH}
        fill="currentColor"
        fillOpacity={0.6}
      />
    </svg>
  );
}
