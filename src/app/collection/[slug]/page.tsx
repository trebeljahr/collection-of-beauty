import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopedGallery } from "@/components/scoped-gallery";
import { pillClasses } from "@/components/ui/pill";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { artworkHref, type Scope } from "@/lib/artwork-scope";
import { getArtwork } from "@/lib/data";
import { getEra } from "@/lib/gallery-eras";
import {
  getPlateSet,
  getPlateSets,
  holdingCaveats,
  holdingSentence,
  type PlateSet,
  plateLabel,
} from "@/lib/plate-sets";
import { buildOpenGraph, jsonLdScriptProps, ogImagesForArtwork, plateSetJsonLd } from "@/lib/seo";

type Params = { slug: string };

// Rendered entirely from the bundled artwork JSON — nothing here reads a
// request, so match the sitemap's daily window instead of re-rendering.
export const revalidate = 86400;

// Four static sets — prebuild all of them. Each is one plate-order pass
// over its folder at build time, and these are the canonical landing for
// any "from=collection:<id>" lightbox return, so they pay to be instant.
export function generateStaticParams(): Params[] {
  return getPlateSets().map((set) => ({ slug: set.id }));
}

/** How many plates go into the JSON-LD `hasPart` array. Every plate has
 *  its own indexable page carrying a full VisualArtwork node, so the
 *  series document only needs enough of a sample to establish the shape;
 *  435 inline nodes would push the document past what a crawler reads.
 *  `numberOfItems` still reports the true total. */
const JSON_LD_PART_LIMIT = 50;

function metaDescription(set: PlateSet): string {
  // "every plate" would overclaim on a set with a shortfall — the
  // holding sentence carries the count, so this half just frames it.
  return `${set.title} (${set.publishedLabel}) by ${set.author}, in published plate order. ${holdingSentence(set)}`;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const set = getPlateSet(slug);
  if (!set) return { title: "Collection not found" };

  const description = metaDescription(set);
  // Pick the first plate that has pre-built variants so OG scrapers hit
  // the fast 1280 WebP rather than the raw original.
  const cover = set.plates.find((p) => p.listing.variantWidths != null)?.listing;
  const coverFull = cover ? getArtwork(cover.id) : null;
  const images = coverFull ? ogImagesForArtwork(coverFull) : undefined;
  // "all N plates" is a completeness claim and belongs only on a set
  // that actually is complete — Les Liliacées is 11 plates short.
  const title = set.isComplete
    ? `${set.title} — all ${set.presentCount} plates`
    : `${set.title} — ${set.presentCount} of ${set.canonicalPlateCount} plates`;

  return {
    title,
    description,
    alternates: { canonical: `/collection/${set.id}` },
    // Same path as alternates.canonical above — buildOpenGraph resolves it
    // to an absolute og:url so the two can't drift apart.
    openGraph: buildOpenGraph({
      type: "article",
      url: `/collection/${set.id}`,
      title: `${title} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    }),
    twitter: {
      card: "summary_large_image",
      title: `${title} · Collection of Beauty`,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export default async function CollectionPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const set = getPlateSet(slug);
  if (!set) notFound();

  const scope: Scope = { kind: "collection", id: set.id };
  const era = getEra(set.eraId);
  const others = getPlateSets().filter((s) => s.id !== set.id);
  const caveats = holdingCaveats(set);

  // Server-render only the first page into the visual grid; the client
  // paginates the rest via /api/artworks/page. sort=plate + the same
  // collection id reproduces this exact ordering, so the initial render
  // and every later batch stitch into one continuous plate sequence.
  const initialPage = getArtworkListingPage({
    collection: set.id,
    sort: "plate",
    limit: DEFAULT_ARTWORK_PAGE_SIZE,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script
        {...jsonLdScriptProps(
          plateSetJsonLd({
            id: set.id,
            title: set.title,
            author: set.author,
            authorSlug: set.authorSlug,
            publishedLabel: set.publishedLabel,
            publishedFrom: set.publishedFrom,
            publishedTo: set.publishedTo,
            description: metaDescription(set),
            presentCount: set.presentCount,
            parts: set.plates.slice(0, JSON_LD_PART_LIMIT).map((plate, i) => ({
              id: plate.listing.id,
              name: plateLabel(set, plate),
              objectKey: plate.listing.objectKey,
              position: plate.plateNumber ?? i + 1,
            })),
          }),
        )}
      />

      <Link
        href="/collections"
        className="rounded-sm text-sm text-[var(--muted-foreground)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        ← All plate sets
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-3">
        <h1 className="font-serif text-3xl md:text-4xl">{set.title}</h1>
        {set.subtitle && (
          <p className="font-serif text-lg italic text-[var(--muted-foreground)]">{set.subtitle}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-[var(--muted-foreground)]">
          <Link
            href={`/artist/${set.authorSlug}`}
            className="rounded-sm underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {set.author}
          </Link>
          <span>· {set.publishedLabel}</span>
          <span>
            · {set.presentCount} plate{set.presentCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/era/${era.id}`}
            className={`${pillClasses} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
          >
            {era.title}
          </Link>
        </div>
      </header>

      <section className="mb-12 max-w-prose rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-serif text-lg">What's here</h2>
        <p className="mt-2 text-sm">{holdingSentence(set)}</p>
        {caveats.map((note) => (
          <p key={note.slice(0, 40)} className="mt-2 text-sm text-[var(--muted-foreground)]">
            {note}
          </p>
        ))}
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          {set.scanNote} Public domain — no permission needed, no attribution required.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href={`/downloads/${set.id}`}
            className="underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Download the whole set as a ZIP →
          </Link>
        </p>
      </section>

      <section>
        <h2 className="mb-4 font-serif text-xl">Every plate, in order</h2>
        <ScopedGallery
          initialArtworks={initialPage.items}
          initialPageInfo={{
            total: initialPage.total,
            nextOffset: initialPage.nextOffset,
            hasMore: initialPage.hasMore,
          }}
          scope={scope}
          pageQuery={{ collection: set.id, sort: "plate" }}
        />
      </section>

      {/* Server-rendered, unpaginated. The grid above never puts more
          than its first chunk into the HTML, so this list is what makes
          all {set.presentCount} plate names crawlable — and it doubles as
          a way to jump straight to a plate by number. */}
      <section className="mt-16">
        <h2 className="font-serif text-xl">Plate index</h2>
        <p className="mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
          All {set.presentCount} plates, listed in published order.
        </p>
        <ol className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {set.plates.map((plate) => (
            <li key={plate.listing.id} className="text-sm leading-6">
              <Link
                href={artworkHref(plate.listing.id, scope)}
                className="rounded-sm underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {plate.plateNumber ?? "—"}
                </span>{" "}
                {plateLabel(set, plate)}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="mb-4 font-serif text-xl">Other plate sets</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {others.map((other) => (
            <li key={other.id}>
              <Link
                href={`/collection/${other.id}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span className="block font-serif">{other.title}</span>
                <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                  {other.author} · {other.presentCount} plates
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
