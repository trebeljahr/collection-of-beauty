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

/** Each column starts at its own height, some above the page top, so the
 *  banner's top edge cuts through the works at different points and the
 *  grid reads as tiles on a wall rather than a table. The top work of a
 *  high column loses its top: column 1 (the second work) starts 6rem up,
 *  which on a phone hides most of it, so put a work there that can spare
 *  its top, not a face. */
const COLUMN_OFFSET = ["-mt-8", "-mt-24", "-mt-2", "-mt-16", "-mt-28", "-mt-6", "-mt-20", "-mt-12"];

/** Where the veil has closed over the works, and how long it takes to
 *  close: the works show clear down to banner minus ramp. Set on both the
 *  layer (for the veil's gradient, `VEIL`) and the spacer that pushes the
 *  page's own content below it. */
const BANNER =
  "[--backdrop-banner:12rem] [--backdrop-ramp:5rem] md:[--backdrop-banner:20rem] md:[--backdrop-ramp:7rem]";
/** The strip's banner is lower: it heads a page of plain text (the
 *  imprint, the privacy policy), where an 18rem band pushed the heading
 *  a third of the way down a laptop screen. */
const STRIP_BANNER = "[--backdrop-banner:9rem] md:[--backdrop-banner:12rem]";

/** The veil over the tiles. Clear across the banner, then the page colour
 *  closes over the works along the ramp and is solid where the banner
 *  ends, so the page's text starts on plain paper. Two weaker versions
 *  (55% then 95% shut at the heading, the works faintly behind the text)
 *  both left the first paragraph reading over tinted boxes. The ramp is
 *  long on purpose; a short one draws a line across every column. No blur:
 *  masked into the ramp, a backdrop-filter smeared a band across the
 *  tiles.
 *
 *  Inline rather than in globals.css. The gradient only means anything
 *  next to this layer's geometry, and Turbopack's dev server twice kept
 *  serving a globals.css build without a newly added rule, which showed
 *  the tiles bare behind the text. */
const VEIL = `linear-gradient(to bottom,
  transparent calc(var(--backdrop-banner) - var(--backdrop-ramp)),
  color-mix(in oklab, var(--background) 65%, transparent) calc(var(--backdrop-banner) - var(--backdrop-ramp) / 2),
  color-mix(in oklab, var(--background) 92%, transparent) calc(var(--backdrop-banner) - var(--backdrop-ramp) / 5),
  var(--background) var(--backdrop-banner))`;
/** `strip`: nothing over the page, only a fade at the foot of the banner
 *  so the tiles don't end on a hard line. 4rem, so the lower strip still
 *  shows most of its height clear. */
const STRIP_VEIL =
  "linear-gradient(to bottom, transparent calc(100% - 4rem), var(--background) 100%)";

const SIZES =
  "(min-width: 1536px) 13vw, (min-width: 1280px) 15vw, (min-width: 1024px) 17vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 34vw";
/** Two rows fill the banner on most screens. The third is for the short
 *  columns (a landscape under a high offset, at tablet widths), where
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
 * banner, then fading into the page colour along a long ramp, solid before
 * the text starts. With `strip`, a lower banner with a short fade, for
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
          // The full layer ends where its veil turns solid: a tile below
          // that line would only ever sit under paper, and clipped it is
          // never fetched.
          strip ? "h-[calc(var(--backdrop-banner)+1rem)]" : "h-[var(--backdrop-banner)]",
        )}
      >
        <div className="flex gap-1.5 px-1.5 md:gap-2 md:px-2">
          {columns.map((column, c) => (
            <div
              key={COLUMN_OFFSET[c]}
              className={cn(
                COLUMNS[c],
                COLUMN_OFFSET[c],
                "min-w-0 flex-1 flex-col gap-1.5 md:gap-2",
              )}
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
        <div className="absolute inset-0" style={{ backgroundImage: strip ? STRIP_VEIL : VEIL }} />
      </div>
      <div
        aria-hidden
        className={cn(
          strip ? STRIP_BANNER : BANNER,
          strip
            ? "h-[calc(var(--backdrop-banner)+2.5rem)]"
            : "h-[calc(var(--backdrop-banner)+1rem)]",
        )}
      />
    </>
  );
}
