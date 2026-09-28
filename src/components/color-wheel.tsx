import type { ColorBucketCounts } from "@/lib/artwork-colors";
import { COLOR_BUCKETS, type ColorBucketId } from "@/lib/color-buckets.mjs";

type Props = {
  counts: ColorBucketCounts;
  /** Family whose segment is drawn pulled out and outlined. */
  active?: ColorBucketId | null;
};

const OUTER = 160;
const INNER = 88;
const CENTER = 176;
const VIEWBOX = CENTER * 2;
/** Gap between segments, in degrees, so the ring reads as twelve
 *  distinct choices rather than one continuous gradient. */
const GAP_DEG = 1.6;
/** How far the active segment slides outward along its own bisector. */
const ACTIVE_OFFSET = 10;

function polar(cx: number, cy: number, radius: number, degrees: number) {
  // -90 so segment zero starts at twelve o'clock rather than three.
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/** Annular sector path from `startDeg` to `endDeg`. */
function segmentPath(cx: number, cy: number, startDeg: number, endDeg: number): string {
  const outerStart = polar(cx, cy, OUTER, startDeg);
  const outerEnd = polar(cx, cy, OUTER, endDeg);
  const innerEnd = polar(cx, cy, INNER, endDeg);
  const innerStart = polar(cx, cy, INNER, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER} ${INNER} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

/** The colour wheel on `/colours`: twelve linked segments, one per
 *  family, sized equally rather than by population — the ring is a
 *  chooser, not a chart, and scaling segments by count would make the
 *  rarest families (pink has a few dozen works) impossible to hit.
 *  Populations are stated as numbers where the wheel is used: beside each
 *  family's row on `/colours`, under the heading on a family page.
 *
 *  Rendered server-side as plain SVG `<a>` links, so it needs no client
 *  JavaScript and every segment is a real, focusable, crawlable link.
 *  Deliberately not `next/link` here: inside `<svg>` React creates an SVG
 *  anchor, whose `href` is an `SVGAnimatedString` rather than a string,
 *  which is not what the router's click handling expects.
 */
export function ColorWheel({ counts, active = null }: Props) {
  const step = 360 / COLOR_BUCKETS.length;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        role="group"
        aria-label="Colour families"
        className="w-full max-w-[352px]"
      >
        <title>Browse the collection by colour family</title>
        {COLOR_BUCKETS.map((bucket, i) => {
          const start = i * step + GAP_DEG / 2;
          const end = (i + 1) * step - GAP_DEG / 2;
          const isActive = bucket.id === active;
          const mid = (start + end) / 2;
          const nudge = polar(0, 0, ACTIVE_OFFSET, mid);
          const count = counts[bucket.id] ?? 0;
          return (
            <a
              key={bucket.id}
              href={`/colours/${bucket.id}`}
              aria-label={`${bucket.label}, ${count} work${count === 1 ? "" : "s"}`}
              className="group focus:outline-none"
            >
              <path
                d={segmentPath(CENTER, CENTER, start, end)}
                fill={bucket.swatch}
                transform={isActive ? `translate(${nudge.x} ${nudge.y})` : undefined}
                stroke={isActive ? "var(--foreground)" : "rgba(0,0,0,0.15)"}
                strokeWidth={isActive ? 2 : 1}
                // The keyboard indicator is the outline the active
                // segment already wears, not the hover dim: an opacity
                // change identical to hover is not a focus ring, and the
                // anchor has suppressed the UA one. Tailwind's classes
                // beat the presentation attributes above, so the rule
                // holds for the inactive segments too.
                className="origin-center transition-opacity group-hover:opacity-80 group-focus-visible:stroke-[color:var(--foreground)] group-focus-visible:stroke-2 group-focus-visible:opacity-80"
              />
            </a>
          );
        })}
        <text
          x={CENTER}
          y={CENTER - 4}
          textAnchor="middle"
          className="fill-[var(--foreground)] font-serif text-[22px]"
        >
          {active ? (counts[active] ?? 0).toLocaleString() : COLOR_BUCKETS.length}
        </text>
        <text
          x={CENTER}
          y={CENTER + 18}
          textAnchor="middle"
          className="fill-[var(--muted-foreground)] text-[12px]"
        >
          {active ? "works" : "families"}
        </text>
      </svg>
    </div>
  );
}
