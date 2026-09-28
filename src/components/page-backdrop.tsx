import { ResponsiveImage } from "@/components/responsive-image";
import type { ArtworkListing } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Columns in the mosaic, and the breakpoint each one appears at, so a
 *  phone shows three wide columns rather than eight slivers. A hidden
 *  column's lazy images are never fetched. */
const COLUMNS = [
  "flex",
  "flex",
  "flex",
  "hidden sm:flex",
  "hidden md:flex",
  "hidden lg:flex",
  "hidden xl:flex",
  "hidden 2xl:flex",
] as const;

/** Where the page's heading lands, as a share of the screen height counted
 *  from the top of the viewport, so the sticky SiteNav above this layer is
 *  part of it: a third of the way down, and a little higher for the strip.
 *  A fixed 20rem under the nav put the heading halfway down a laptop screen
 *  (55% at 720 px tall). `svh`, so a phone's URL bar showing or hiding
 *  doesn't move the page. Clamped: short screens keep a band of works,
 *  tall ones stop at the old 20rem.
 *
 *  `--backdrop-nav` is SiteNav's rendered height: 69 px below md (the 44 px
 *  menu button, py-3, the border), 59 px from md (the 34 px Surprise pill,
 *  py-3, the border; 57 px until lg, where the pill has no label). Keep it
 *  in step with site-nav.tsx.
 *
 *  `--backdrop-banner` is where the veil ends and the spacer's 1rem starts;
 *  `--backdrop-ramp` is how long the veil takes to close over the works,
 *  a fixed share of the banner so a short banner still shows some works
 *  clear. Set on both the layer (for `VEIL`) and the spacer that pushes
 *  the page's own content below it. */
const NAV = "[--backdrop-nav:69px] md:[--backdrop-nav:59px]";
const RAMP = "[--backdrop-ramp:calc(var(--backdrop-banner)*0.35)]";
const BANNER = cn(
  NAV,
  RAMP,
  "[--backdrop-banner:clamp(7rem,calc(100svh/3_-_var(--backdrop-nav)_-_1rem),20rem)]",
);
/** The strip heads a page of plain text (the imprint, the privacy policy),
 *  where the text should start high: its heading lands at 30% of the
 *  screen, at most 13.5rem under the nav. On a phone that is where it was
 *  before; 28% left a laptop only a sliver of each work. */
const STRIP_BANNER = cn(
  NAV,
  RAMP,
  "[--backdrop-banner:clamp(6rem,calc(30svh_-_var(--backdrop-nav)_-_1rem),13.5rem)]",
);

/** The veil over the tiles. Clear across the banner, then the page colour
 *  closes over the works along the ramp and is solid 1.25rem above the
 *  banner's end, so the page's text starts well inside plain paper. Weaker
 *  versions (55%, then 95% shut at the heading; then solid exactly at the
 *  banner's end) all read as the works crowding the heading. The ramp is
 *  long on purpose; a short one draws a line across every column. No blur:
 *  masked into the ramp, a backdrop-filter smeared a band across the
 *  tiles.
 *
 *  Inline rather than in globals.css. The gradient only means anything
 *  next to this layer's geometry, and Turbopack's dev server twice kept
 *  serving a globals.css build without a newly added rule, which showed
 *  the tiles bare behind the text. */
const VEIL = `linear-gradient(to bottom,
  transparent calc(var(--backdrop-banner) - 1.25rem - var(--backdrop-ramp)),
  color-mix(in oklab, var(--background) 72%, transparent) calc(var(--backdrop-banner) - 1.25rem - var(--backdrop-ramp) / 2),
  color-mix(in oklab, var(--background) 95%, transparent) calc(var(--backdrop-banner) - 1.25rem - var(--backdrop-ramp) / 5),
  var(--background) calc(var(--backdrop-banner) - 1.25rem))`;

const SIZES =
  "(min-width: 1536px) 13vw, (min-width: 1280px) 15vw, (min-width: 1024px) 17vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 34vw";
/** Two rows fill the banner on most screens. The third is for the short
 *  columns (two landscapes stacked, at tablet widths), where
 *  without it the banner shows holes of bare paper; it shows at most as a
 *  sliver inside the ramp, so it asks for about half its width and gets
 *  the 256 px rung. Nothing past the third row is rendered: lazy loading
 *  goes by distance from the viewport, not by the layer's clip, so every
 *  tile in the markup is fetched. /about measures 21 tiles and ~720 KB at
 *  1440 px on a 2x screen, 9 tiles and ~300 KB on a 390 px phone. */
const FULL_ROWS = 2;
const MAX_ROWS = 3;
const SLIVER_SIZES = "(min-width: 768px) 8vw, 17vw";

/**
 * Works tiled across the top of a prose page: shown clearly across a
 * banner that starts just under the nav, every column's top work whole, then fading into the page colour along a long ramp, solid before
 * the text starts. With `strip`, a lower banner with a shorter fade, for
 * pages where the text should start high (the imprint, the privacy
 * policy).
 *
 * Decoration only: hidden from assistive tech, no links and no captions.
 * Render it as the first child of a `relative isolate` wrapper (the
 * isolate keeps the -z-10 layer above the page's own background) that
 * also holds the page content; the spacer it renders pushes that content
 * down to the bottom of the banner.
 *
 * `works` are dealt into the columns left to right, row by row, so the
 * first three are the top row on a phone and the first eight the top row
 * on the widest screens. Order them by how much each should be seen. At
 * most three rows are used (24 works); the rest are ignored.
 */
export function PageBackdrop({
  works,
  strip = false,
}: {
  works: readonly ArtworkListing[];
  strip?: boolean;
}) {
  const columns = COLUMNS.map((_, c) =>
    works.filter((_, i) => i % COLUMNS.length === c).slice(0, MAX_ROWS),
  );

  return (
    <>
      <div
        aria-hidden
        className={cn(
          strip ? STRIP_BANNER : BANNER,
          "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden select-none",
          // Past the banner the veil is solid, so the layer stops there;
          // a tile below it could only ever sit under paper.
          "h-[var(--backdrop-banner)]",
        )}
      >
        {/* Every column starts at the top, one gap under the nav. They used
            to start at staggered heights above it, so the nav's edge cut
            the top off most of the first row. The works' own proportions
            still stagger the columns further down. */}
        <div className="flex gap-1.5 p-1.5 md:gap-2 md:p-2">
          {columns.map((column, c) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed column slots, never reordered
              key={c}
              className={cn(COLUMNS[c], "min-w-0 flex-1 flex-col gap-1.5 md:gap-2")}
            >
              {column.map((work, row) => (
                <ResponsiveImage
                  key={work.id}
                  objectKey={work.objectKey}
                  alt=""
                  sizes={row < FULL_ROWS ? SIZES : SLIVER_SIZES}
                  variantWidths={work.variantWidths}
                  srcWidth={work.width ?? undefined}
                  srcHeight={work.height ?? undefined}
                  dominantColor={work.dominantColor}
                  thumbHash={work.thumbHash}
                  className="h-auto w-full"
                />
              ))}
            </div>
          ))}
        </div>
        <div className="absolute inset-0" style={{ backgroundImage: VEIL }} />
      </div>
      <div
        aria-hidden
        className={cn(strip ? STRIP_BANNER : BANNER, "h-[calc(var(--backdrop-banner)+1rem)]")}
      />
    </>
  );
}
