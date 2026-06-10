import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopedGallery } from "@/components/scoped-gallery";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { resolveScope } from "@/lib/artwork-scope";
import { getArtwork } from "@/lib/data";
import { ERAS, type EraId, type getEra } from "@/lib/gallery-eras";
import { ogImagesForArtwork } from "@/lib/seo";

type Params = { id: string };

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
    openGraph: {
      type: "article",
      title: `${era.title} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    },
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
  // infinite-scroll pattern. Sort=year mirrors resolveScope's era
  // ordering so the initial render + subsequent batches stitch into a
  // single chronological sequence.
  const initialPage = getArtworkListingPage({
    era: era.id,
    sort: "year",
    limit: DEFAULT_ARTWORK_PAGE_SIZE,
  });
  const idx = ERAS.findIndex((e) => e.id === era.id);
  const prev = idx > 0 ? ERAS[idx - 1] : null;
  const next = idx < ERAS.length - 1 ? ERAS[idx + 1] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/eras"
        className="rounded-sm text-sm text-[var(--muted-foreground)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
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
          <div className="flex flex-wrap gap-1.5">
            {era.movements.map((m) => (
              <Link
                key={m}
                href={`/timeline?movement=${encodeURIComponent(m)}`}
                className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Badge variant="secondary">{m}</Badge>
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
            <Link
              href={`/era/${prev.id}`}
              className="rounded-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/era/${next.id}`}
              className="rounded-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
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
          pageQuery={{ era: era.id, sort: "year" }}
        />
      </section>
    </div>
  );
}
