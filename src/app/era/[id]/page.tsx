import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopedGallery } from "@/components/scoped-gallery";
import { touchTextLinkClasses } from "@/components/ui/pill";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { resolveScope } from "@/lib/artwork-scope";
import { getArtwork } from "@/lib/data";
import { ERAS, type EraId, eraYearLabel, type getEra, movementCounts } from "@/lib/gallery-eras";
import { buildOpenGraph, ogImagesForArtwork } from "@/lib/seo";

type Params = { id: string };

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
  const topMovements = movementCounts(works)
    .slice(0, 3)
    .map((m) => m.movement)
    .join(", ");
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
  const movements = movementCounts(resolveScope({ kind: "era", id: era.id }));
  const idx = ERAS.findIndex((e) => e.id === era.id);
  const prev = idx > 0 ? ERAS[idx - 1] : null;
  const next = idx < ERAS.length - 1 ? ERAS[idx + 1] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/eras"
        className={`${touchTextLinkClasses} text-sm text-[var(--muted-foreground)]`}
      >
        ← All eras
      </Link>

      <header className="mt-4 mb-6 flex flex-col gap-3">
        <h1 className="font-serif text-3xl md:text-4xl">{era.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-[var(--muted-foreground)]">
          <span>{eraYearLabel(era)}</span>
          <span>
            · {initialPage.total} work{initialPage.total === 1 ? "" : "s"}
          </span>
        </div>
        {/* Plain text, not chips: every chip on the site links to one of the
            eras on /eras. A movement chip here only restated the title
            ("Botanical illustration" under "Natural History & Botanical
            Illustration") and sent people to a timeline filter instead. */}
        {movements.length > 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {movements.map(({ movement, count }, i) => (
              <span key={movement}>
                {i > 0 && " · "}
                {movement} <span className="tabular-nums">{count}</span>
              </span>
            ))}
          </p>
        )}
        <p className="max-w-prose italic text-[var(--muted-foreground)]">{era.blurb}</p>
      </header>

      {(prev || next) && (
        <nav
          aria-label="Adjacent eras"
          className="mb-8 flex items-center justify-between text-sm text-[var(--muted-foreground)]"
        >
          {prev ? (
            <Link href={`/era/${prev.id}`} className={touchTextLinkClasses}>
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/era/${next.id}`} className={touchTextLinkClasses}>
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
