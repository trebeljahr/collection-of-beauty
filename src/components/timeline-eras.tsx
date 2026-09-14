import Link from "next/link";
import { ResponsiveImage } from "@/components/responsive-image";
import { resolveScope } from "@/lib/artwork-scope";
import type { ArtworkListing } from "@/lib/data";
import { ERAS, eraYearLabel } from "@/lib/gallery-eras";

/** Prefers the first work with pre-built variants so the thumbnail is
 *  served as AVIF rather than the raw original. */
function pickCover(works: ArtworkListing[]): ArtworkListing | null {
  return works.find((a) => a.variantWidths != null) ?? works[0] ?? null;
}

/**
 * The era index that used to be its own `/eras` page, folded into the
 * top of `/timeline` so the nav carries one chronological destination
 * instead of two. `/eras` redirects to `#eras`.
 *
 * Eras can't become headings *inside* the decade list: four of them
 * (Natural History, Realism, East Asian, Post-Impressionism) are
 * movement-only and overlap the dated eras' decades, so the cards sit
 * above the chart as a separate index.
 *
 * Below `sm` the cards scroll sideways in one row — eleven stacked cards
 * would push the decade chart a full phone-screen down. From `sm` up
 * they wrap into a grid of compact tiles.
 */
export function TimelineEras() {
  // Server component on a static page: the eleven resolveScope passes
  // run at build time, as they did on the old /eras page.
  const cards = ERAS.map((era) => {
    const works = resolveScope({ kind: "era", id: era.id });
    return { era, cover: pickCover(works), count: works.length };
  });

  return (
    <section id="eras" aria-labelledby="eras-heading" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="eras-heading" className="font-serif text-xl">
          Eras
        </h2>
        <p className="text-xs text-[var(--muted-foreground)]">One floor each in the 3D museum</p>
      </div>
      {/* py-1/px-1 is focus-ring clearance: overflow-x-auto clips both
          axes, and the cards' ring paints 2px outside their box. */}
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 py-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(({ era, cover, count }) => (
          <li key={era.id} className="w-60 shrink-0 snap-start sm:w-auto">
            <Link
              href={`/era/${era.id}`}
              className="group flex h-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 transition-colors hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <div
                className="relative size-16 shrink-0 overflow-hidden rounded-md"
                style={{ backgroundColor: era.palette.wallColor }}
              >
                {cover && (
                  <ResponsiveImage
                    objectKey={cover.objectKey}
                    variantWidths={cover.variantWidths}
                    alt=""
                    fill
                    sizes="64px"
                    loading="lazy"
                    className="transition-transform duration-500 group-hover:scale-110"
                  />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-serif text-base leading-tight">{era.title}</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {eraYearLabel(era)} · {count} work{count === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
