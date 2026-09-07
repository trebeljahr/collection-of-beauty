import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopedGallery } from "@/components/scoped-gallery";
import { pillClasses } from "@/components/ui/pill";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { resolveScope } from "@/lib/artwork-scope";
import { getArtwork } from "@/lib/data";
import { ERAS, type EraId, type getEra } from "@/lib/gallery-eras";
import { buildOpenGraph, ogImagesForArtwork } from "@/lib/seo";

type Params = { id: string };

/* Movement chips. `min-h-11` is the 44px WCAG 2.5.5 touch-target
   minimum — the pill's own type only makes 26px — and it is gated to
   below `sm:` on purpose: 2.5.5 is a *touch* criterion, mouse pointers
   are governed by 2.5.8's 24px, which the bare pill already clears.
   Ungated, every chip row on a desktop (an era carries up to a dozen
   movements) would become a stack of rounded-full slabs. Below `sm:` the
   pill itself grows rather than gaining an invisible overflowing hit
   area, because these rows wrap and such a target would sit on top of
   the chip in the row above; the row's gutter opens to gap-2 at the same
   breakpoint so the taller pills don't read as one slab. The identical
   string lives on /artwork/[id], /artist/[slug] and /collection/[slug] —
   keep the four in step. */
const CHIP = `${pillClasses} min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0`;

/* Bare text links (back / adjacent eras). Same story: 44px below `sm:`,
   the plain inline anchor above it. `-my-3` hands the extra 24px back to
   layout so the surrounding blocks keep their positions — the enlarged
   box merely overlaps neighbouring lines, none of which are clickable —
   and `sm:inline` returns it to an ordinary inline box so long labels
   wrap on desktop exactly as they did before. This is the idiom on every
   page that grew a touch target: enlarge the box and overlap, never
   shrink a neighbour's margin. */
const TEXT_LINK =
  "-my-3 inline-flex min-h-11 items-center rounded-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:my-0 sm:inline sm:min-h-0";

// Rendered entirely from the bundled artwork JSON — nothing here reads a
// request, so match the sitemap's daily window instead of re-rendering.
export const revalidate = 86400;

// All 11 eras are static — prebuild every one. Each runs a single
// resolveScope pass (~2,950 listings filtered + sorted) at build time
// which is trivial, and the surface is the canonical landing for any
// "from=era:<id>" lightbox return so it pays to be instant.
export function generateStaticParams(): Params[] {
  return ERAS.map((e) => ({ id: e.id }));
}

function findEra(id: string): ReturnType<typeof getEra> | null {
  return ERAS.find((e) => e.id === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const era = findEra(id);
  if (!era) return { title: "Era not found" };

  const works = resolveScope({ kind: "era", id: era.id });
  const countLabel = `${works.length} work${works.length === 1 ? "" : "s"}`;
  const topMovements = era.movements.slice(0, 3).join(", ");
  const description = `${countLabel} · ${era.blurb}${topMovements ? ` · ${topMovements}` : ""} — Collection of Beauty.`;

  // Pick the first artwork that has pre-built variants so OG scrapers
  // hit the fast 1280 WebP rather than the raw original.
  const cover = works.find((a) => a.variantWidths != null) ?? works[0] ?? null;
  const coverFull = cover ? getArtwork(cover.id) : null;
  const images = coverFull ? ogImagesForArtwork(coverFull) : undefined;

  return {
    title: era.title,
    description,
    alternates: { canonical: `/era/${era.id}` },
    // Same path as alternates.canonical above — buildOpenGraph resolves it to
    // an absolute og:url so the two can't drift apart.
    openGraph: buildOpenGraph({
      type: "article",
      url: `/era/${era.id}`,
      title: `${era.title} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    }),
    twitter: {
      card: "summary_large_image",
      title: `${era.title} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    },
  };
}

function yearRangeLabel(era: ReturnType<typeof getEra>): string {
  // Ukiyo-e is movement-tagged only (yearMin > yearMax) — surface that
  // honestly rather than printing nonsense like "9999–0".
  if (era.yearMin > era.yearMax) return "Movement-tagged only";
  return `${era.yearMin}–${era.yearMax}`;
}

export default async function EraPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const era = findEra(id);
  if (!era) notFound();

  // Server-render only the first page of works; the client paginates
  // the rest via /api/artworks/page, matching the home gallery's
  // infinite-scroll pattern. Sort=shuffle (seeded artist-spread, default
  // seed) mirrors resolveScope's era ordering so the initial render +
  // subsequent batches stitch into one deterministic sequence. Year
  // order clumped single-artist cohorts — natural-history opened with
  // 435 consecutive Audubon plates before the first Haeckel.
  const initialPage = getArtworkListingPage({
    era: era.id,
    sort: "shuffle",
    limit: DEFAULT_ARTWORK_PAGE_SIZE,
  });
  const idx = ERAS.findIndex((e) => e.id === era.id);
  const prev = idx > 0 ? ERAS[idx - 1] : null;
  const next = idx < ERAS.length - 1 ? ERAS[idx + 1] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/eras" className={`${TEXT_LINK} text-sm text-[var(--muted-foreground)]`}>
        ← All eras
      </Link>

      <header className="mt-4 mb-6 flex flex-col gap-3">
        <h1 className="font-serif text-3xl md:text-4xl">{era.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-[var(--muted-foreground)]">
          <span>{yearRangeLabel(era)}</span>
          <span>
            · {initialPage.total} work{initialPage.total === 1 ? "" : "s"}
          </span>
        </div>
        {era.movements.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:gap-1.5">
            {era.movements.map((m) => (
              <Link key={m} href={`/timeline?movement=${encodeURIComponent(m)}`} className={CHIP}>
                {m}
              </Link>
            ))}
          </div>
        )}
        <p className="max-w-prose italic text-[var(--muted-foreground)]">{era.blurb}</p>
      </header>

      {(prev || next) && (
        <nav
          aria-label="Adjacent eras"
          className="mb-8 flex items-center justify-between text-sm text-[var(--muted-foreground)]"
        >
          {prev ? (
            <Link href={`/era/${prev.id}`} className={TEXT_LINK}>
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/era/${next.id}`} className={TEXT_LINK}>
              {next.title} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <section>
        <h2 className="mb-4 font-serif text-xl">Works in this era</h2>
        <ScopedGallery
          initialArtworks={initialPage.items}
          initialPageInfo={{
            total: initialPage.total,
            nextOffset: initialPage.nextOffset,
            hasMore: initialPage.hasMore,
          }}
          scope={{ kind: "era", id: era.id as EraId }}
          pageQuery={{ era: era.id, sort: "shuffle" }}
        />
      </section>
    </div>
  );
}
