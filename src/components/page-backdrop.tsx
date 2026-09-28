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
 *  closes over the works along the ramp, and is 95% shut where the banner
 *  ends, so the heading below it sits on paper. Under the text the works
 *  are a faint tint (3–5% through), and gone by three quarters of the
 *  layer. An earlier, weaker veil (55% at the heading, 86% under the first
 *  paragraph) let dark tiles grey out whole lines of text. The ramp is
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
  color-mix(in oklab, var(--background) 60%, transparent) calc(var(--backdrop-banner) - var(--backdrop-ramp) / 2),
  color-mix(in oklab, var(--background) 95%, transparent) var(--backdrop-banner),
  color-mix(in oklab, var(--background) 97%, transparent) calc(var(--backdrop-banner) + 6rem),
  var(--background) 75%)`;
/** `strip`: nothing over the page, only a fade at the foot of the banner
 *  so the tiles don't end on a hard line. 4rem, so the lower strip still
 *  shows most of its height clear. */
const STRIP_VEIL =
  "linear-gradient(to bottom, transparent calc(100% - 4rem), var(--background) 100%)";

const SIZES =
  "(min-width: 1536px) 13vw, (min-width: 1280px) 15vw, (min-width: 1024px) 17vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 34vw";
/** Tiles from the third row down are under most of the veil, where the
 *  256 px rung looks the same as a sharp one. Asking for about half their
 *  width steers the browser to it: on /about that took the backdrop from
 *  265 to 150 KB at 1440 px on a 2x screen, and from 191 to 25 KB on a
 *  390 px phone at 3x. */
const VEILED_SIZES = "(min-width: 768px) 8vw, 17vw";
const SHARP_ROWS = 2;

/**
 * Works tiled behind the top of a prose page: shown clearly across a
 * banner, then fading under a veil of the page colour, so the text below
 * reads on nearly plain paper with the works still faintly behind it.
 * With `strip`, only the banner: the tiles end in a short fade just below
 * it and the page under them is plain.
 *
 * Decoration only: hidden from assistive tech, no links and no captions.
 * Render it as the first child of a `relative isolate` wrapper (the
 * isolate keeps the -z-10 layer above the page's own background) that
 * also holds the page content; the spacer it renders pushes that content
 * down to the bottom of the banner.
 *
 * `works` are dealt into the columns left to right, row by row, so the
 * first three are the top row on a phone and the first eight the top row
 * on the widest screens. Order them by how much each should be seen.
 */
export function PageBackdrop({
  works,
  strip = false,
}: {
  works: readonly ArtworkListing[];
  strip?: boolean;
}) {
  const columns = COLUMNS.map((_, c) => works.filter((_, i) => i % COLUMNS.length === c));

  return (
    <>
      <div
        aria-hidden
        className={cn(
          strip ? STRIP_BANNER : BANNER,
          "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden select-none",
          strip ? "h-[calc(var(--backdrop-banner)+1rem)]" : "h-[32rem] md:h-[50rem]",
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
                  sizes={strip || row < SHARP_ROWS ? SIZES : VEILED_SIZES}
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
