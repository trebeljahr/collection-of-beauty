import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ColorWheel } from "@/components/color-wheel";
import { ScopedGallery } from "@/components/scoped-gallery";
import { allColorBucketCounts } from "@/lib/artwork-colors";
import { DEFAULT_ARTWORK_PAGE_SIZE, DEFAULT_SHUFFLE_SEED } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { resolveScope } from "@/lib/artwork-scope";
import {
  COLOR_BUCKETS,
  type ColorBucket,
  type ColorBucketId,
  isColorBucketId,
} from "@/lib/color-buckets.mjs";
import { getArtwork } from "@/lib/data";
import { buildOpenGraph, ogImagesForArtwork } from "@/lib/seo";

type Params = { family: string };

export const revalidate = 86400;

// All twelve families are static — prebuild every one, same reasoning as
// the era pages: each is one filter pass over the baked listings, and
// they're the canonical landing for any "from=color:<id>" lightbox
// return.
export function generateStaticParams(): Params[] {
  return COLOR_BUCKETS.map((b) => ({ family: b.id }));
}

function findFamily(family: string): ColorBucket | null {
  if (!isColorBucketId(family)) return null;
  return COLOR_BUCKETS.find((b) => b.id === family) ?? null;
}

/** One line per family, so each page says something the others don't and
 *  the neutral bands explain why an engraving files under "white". */
const BLURBS: Record<ColorBucketId, string> = {
  red: "Vermilion, crimson, madder lake.",
  orange: "Sienna, terracotta, burnt orange.",
  gold: "Ochre, amber, marigold.",
  brown: "The earth pigments: umber, bistre, bitumen.",
  green: "Foliage, verdigris, sap green.",
  teal: "Blue-greens: shallow water, glaze, patina.",
  blue: "Ultramarine, indigo, Prussian blue.",
  purple: "Violet and mauve. The smallest family in the collection.",
  pink: "Rose and madder lake at low saturation.",
  white: "Paper, plaster and bare ground. Mostly prints and drawings.",
  grey: "Grisaille and engraving.",
  black: "Ink, night scenes, dark grounds.",
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { family } = await params;
  const bucket = findFamily(family);
  if (!bucket) return { title: "Colour not found" };

  const works = resolveScope({ kind: "color", id: bucket.id });
  const countLabel = `${works.length} work${works.length === 1 ? "" : "s"}`;
  const description = `${countLabel} in ${bucket.label.toLowerCase()} — ${BLURBS[bucket.id]} Collection of Beauty.`;

  // Pick the first artwork that has pre-built variants so OG scrapers hit
  // the fast 1280 WebP rather than the raw original.
  const cover = works.find((a) => a.variantWidths != null) ?? works[0] ?? null;
  const coverFull = cover ? getArtwork(cover.id) : null;
  const images = coverFull ? ogImagesForArtwork(coverFull) : undefined;

  return {
    title: `${bucket.label} works`,
    description,
    alternates: { canonical: `/colours/${bucket.id}` },
    openGraph: buildOpenGraph({
      type: "article",
      url: `/colours/${bucket.id}`,
      title: `${bucket.label} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    }),
    twitter: {
      card: "summary_large_image",
      title: `${bucket.label} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export default async function ColourFamilyPage({ params }: { params: Promise<Params> }) {
  const { family } = await params;
  const bucket = findFamily(family);
  if (!bucket) notFound();

  // Server-render only the first page; the client paginates the rest via
  // /api/artworks/page. sort=color mirrors resolveScope's `color`
  // ordering, so the initial render and every subsequent batch stitch
  // into one deterministic sequence.
  //
  // Ranked by amount rather than shuffled: membership in a family is a
  // low bar by design, so a shuffle opened the red page with works
  // carrying a red accent as often as with red ones. Strongest first
  // means the first screen answers "show me red" and the accent works
  // sink to where someone scrolling for them will still find them.
  const initialPage = getArtworkListingPage({
    color: bucket.id,
    sort: "color",
    limit: DEFAULT_ARTWORK_PAGE_SIZE,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link
        href="/colours"
        className="rounded-sm text-sm text-[var(--muted-foreground)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        ← All colours
      </Link>

      <div className="mt-4 mb-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-8 rounded-full ring-1 ring-black/15 ring-inset"
              style={{ backgroundColor: bucket.swatch }}
            />
            <h1 className="font-serif text-3xl md:text-4xl">{bucket.label}</h1>
          </div>
          <p className="text-[var(--muted-foreground)]">
            {initialPage.total.toLocaleString()} work{initialPage.total === 1 ? "" : "s"}
          </p>
          <p className="max-w-prose italic text-[var(--muted-foreground)]">{BLURBS[bucket.id]}</p>
        </header>

        <div className="md:w-[280px]">
          <ColorWheel counts={allColorBucketCounts()} active={bucket.id} showLegend={false} />
        </div>
      </div>

      {initialPage.total === 0 ? (
        <p className="py-16 text-center text-[var(--muted-foreground)]">
          No works in this family yet.
        </p>
      ) : (
        <ScopedGallery
          initialArtworks={initialPage.items}
          initialPageInfo={{
            total: initialPage.total,
            nextOffset: initialPage.nextOffset,
            hasMore: initialPage.hasMore,
          }}
          scope={{ kind: "color", id: bucket.id }}
          pageQuery={{ color: bucket.id, sort: "color", seed: DEFAULT_SHUFFLE_SEED }}
        />
      )}
    </div>
  );
}
