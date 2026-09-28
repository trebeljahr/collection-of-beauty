import type { Metadata } from "next";
import Link from "next/link";
import { ColorWheel } from "@/components/color-wheel";
import { ResponsiveImage } from "@/components/responsive-image";
import { allColorBucketCounts } from "@/lib/artwork-colors";
import { colorFamilyStrips, type StripFrame, stripCount } from "@/lib/color-strips";
import { type ArtworkListing, summary } from "@/lib/data";
import { buildOpenGraph } from "@/lib/seo";
import { cn } from "@/lib/utils";

// Rendered entirely from the bundled artwork JSON — nothing here reads a
// request, so match the sitemap's daily window instead of re-rendering.
export const revalidate = 86400;

const DESCRIPTION =
  `Browse ${summary.totalArtworks.toLocaleString()} public-domain works by colour, ` +
  `sorted into twelve families read from the pixels of each work.`;

export const metadata: Metadata = {
  title: "Colours",
  description: DESCRIPTION,
  alternates: { canonical: "/colours" },
  // Same path as alternates.canonical above — buildOpenGraph resolves it to
  // an absolute og:url so the two can't drift apart.
  openGraph: buildOpenGraph({
    url: "/colours",
    title: "Colours · Collection of Beauty",
    description: DESCRIPTION,
  }),
};

/** Strip geometry per breakpoint, smallest first. `width` is the strip's
 *  width at `viewport`, so it is tied to the layout below: `px-4` page
 *  padding, the `max-w-7xl` column, and from `lg` the 10rem label column
 *  and its 2rem gap. `gap` matches `gap-1.5 sm:gap-2` on the strip. The
 *  classes are literal so Tailwind sees them. */
const FRAMES: (StripFrame & { viewport: number; show: string; hide: string })[] = [
  { viewport: 390, width: 358, height: 112, gap: 6, show: "block", hide: "hidden" },
  { viewport: 640, width: 608, height: 140, gap: 8, show: "sm:block", hide: "sm:hidden" },
  { viewport: 768, width: 736, height: 150, gap: 8, show: "md:block", hide: "md:hidden" },
  { viewport: 1024, width: 800, height: 160, gap: 8, show: "lg:block", hide: "lg:hidden" },
  { viewport: 1280, width: 1056, height: 180, gap: 8, show: "xl:block", hide: "xl:hidden" },
];

/** SSR'd tiles that carry their ThumbHash blur in the HTML; the rest add
 *  it after hydration. Same budget, for the same reason, as
 *  EAGER_BLUR_TILES in artwork-gallery.tsx, which is a client module and
 *  so can't lend its constant to a server component. */
const EAGER_BLUR_TILES = 24;

type Tile = { work: ArtworkListing; className: string; sizes: string; aspect: number };

/** A family's works laid out as one justified line per breakpoint: every
 *  work at the row's height and its own aspect, uncropped. `stripCount`
 *  picks how many show at each breakpoint and CSS hides the rest, so the
 *  line fills the strip exactly at every width without measuring it. */
function stripTiles(works: ArtworkListing[]): Tile[] {
  // pickColorStrip only passes works with a size.
  const aspectOf = (work: ArtworkListing) => (work.width ?? 1) / (work.height ?? 1);
  const counts = FRAMES.map((frame) => stripCount(works, frame));
  // Each frame's row height, which is what a tile's width follows from.
  const rowHeights = FRAMES.map((frame, i) => {
    const aspects = works.slice(0, counts[i]).reduce((sum, w) => sum + aspectOf(w), 0);
    return (frame.width - (counts[i] - 1) * frame.gap) / aspects;
  });
  const shown = Math.max(...counts);

  return works.slice(0, shown).map((work, index) => {
    const aspect = aspectOf(work);
    const className = FRAMES.map((frame, i) => (index < counts[i] ? frame.show : frame.hide)).join(
      " ",
    );
    // Widest breakpoint first, as `sizes` takes the first match. Below
    // `xl` the strip, and so every tile, widens with the viewport until
    // the next breakpoint, so those are vw; from `xl` the column is capped
    // and the width is fixed.
    const sizes = FRAMES.map((frame, i) => {
      const px = Math.ceil(aspect * rowHeights[i]);
      const size =
        i === FRAMES.length - 1 ? `${px}px` : `${Math.ceil((px / frame.viewport) * 100)}vw`;
      return i === 0 ? size : `(min-width: ${frame.viewport}px) ${size}`;
    })
      .reverse()
      .join(", ");
    return { work, className, sizes, aspect };
  });
}

export default function ColoursPage() {
  const counts = allColorBucketCounts();
  let tilesBefore = 0;
  const rows = colorFamilyStrips().map(({ bucket, works }) => {
    const tiles = stripTiles(works);
    const firstTile = tilesBefore;
    tilesBefore += tiles.length;
    return { bucket, tiles, firstTile };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-10 text-center">
        <h1 className="font-serif text-3xl md:text-4xl">Colours</h1>
      </header>

      <ColorWheel counts={counts} />

      {/* One row per family, each a single link to that family's page,
          whose grid opens on the same works: the strip is the head of its
          strongest-first order. The whole row is the target, so on a phone
          this is also the list of twelve destinations the wheel's thin
          segments can't be. */}
      <ul className="mt-12 space-y-8 md:mt-16 lg:space-y-10">
        {rows.map(({ bucket, tiles, firstTile }) => {
          const count = counts[bucket.id] ?? 0;
          return (
            <li key={bucket.id}>
              <Link
                href={`/colours/${bucket.id}`}
                className="group block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--background)] lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-center lg:gap-8"
              >
                <div className="mb-3 flex items-baseline gap-3 lg:mb-0 lg:flex-col lg:items-start lg:gap-1">
                  <h2 className="flex items-center gap-2.5 font-serif text-xl leading-tight">
                    <span
                      aria-hidden
                      /* Ring is a flat black alpha rather than a token: it
                         has to read as an edge against both the pale white
                         swatch and the near-black one. */
                      className="size-4 shrink-0 rounded-full ring-1 ring-black/15 ring-inset"
                      style={{ backgroundColor: bucket.swatch }}
                    />
                    <span className="underline-offset-4 group-hover:underline">{bucket.label}</span>
                  </h2>
                  <p className="text-sm tabular-nums text-[var(--muted-foreground)] lg:pl-[1.625rem]">
                    {count.toLocaleString()} work{count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-start gap-1.5 sm:gap-2">
                  {tiles.map(({ work, className, sizes, aspect }, i) => (
                    <div
                      key={work.id}
                      className={cn("relative", className)}
                      // Grow in proportion to the aspect ratio from a zero
                      // basis, and every tile in the line lands at the
                      // same height: the justified row, in CSS alone.
                      style={{ flex: `${aspect} 1 0%`, aspectRatio: aspect }}
                    >
                      {/* alt="" because the link is named by the family
                            and its count; these works are that family's
                            face, not destinations of their own. */}
                      <ResponsiveImage
                        objectKey={work.objectKey}
                        variantWidths={work.variantWidths}
                        alt=""
                        fill
                        sizes={sizes}
                        dominantColor={work.dominantColor}
                        thumbHash={work.thumbHash}
                        workWidth={work.width}
                        workHeight={work.height}
                        deferThumbHash={firstTile + i >= EAGER_BLUR_TILES}
                      />
                    </div>
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
