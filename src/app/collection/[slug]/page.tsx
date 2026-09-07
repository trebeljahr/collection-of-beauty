import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopedGallery } from "@/components/scoped-gallery";
import { pillClasses } from "@/components/ui/pill";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { artworkHref, type Scope } from "@/lib/artwork-scope";
import {
  collectionZipEntries,
  getCollection,
  isCollectionCapped,
  ZIP_MAX_ENTRIES,
  ZIP_VARIANT_WIDTH,
} from "@/lib/collections";
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

/* Bare text links. `min-h-11` is the 44px WCAG 2.5.5 touch-target
   minimum, gated to below `sm:` because 2.5.5 is a *touch* criterion —
   a mouse pointer is governed by 2.5.8's 24px, which these already
   clear, so nothing asks the desktop layout to grow. `-my-3` hands the
   extra 24px back to layout so the surrounding blocks keep their exact
   positions (the enlarged box merely overlaps neighbouring lines, none
   of which are clickable), and `sm:inline` returns the anchor to an
   ordinary inline box above the breakpoint. This is the idiom on every
   page that grew a touch target — /artwork/[id], /artist/[slug],
   /era/[id] and /colours/[family] — enlarge the box and
   overlap, never shrink a neighbour's margin. */
const TEXT_LINK =
  "-my-3 inline-flex min-h-11 items-center rounded-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:my-0 sm:inline sm:min-h-0";

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

  // This is the only page about the set, so it carries the archive too.
  // `getCollection` keys off the same id space as `getPlateSet`.
  const collection = getCollection(set.id);
  const zipEntryCount = collection ? collectionZipEntries(collection).length : 0;
  const zipCapped = collection ? isCollectionCapped(collection) : false;

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

      <Link href="/collections" className={`${TEXT_LINK} text-sm text-[var(--muted-foreground)]`}>
        ← All plate sets
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-3">
        <h1 className="font-serif text-3xl md:text-4xl">{set.title}</h1>
        {set.subtitle && (
          <p className="font-serif text-lg italic text-[var(--muted-foreground)]">{set.subtitle}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-[var(--muted-foreground)]">
          {/* The only tappable thing in this meta row, sitting shoulder to
              shoulder with plain text — so on a phone it needs the 44px box
              even though the row around it is a 24px line. `-my-3` keeps
              the flex line 24px tall regardless, so the row does not grow. */}
          <Link href={`/artist/${set.authorSlug}`} className={`${TEXT_LINK} underline-offset-4`}>
            {set.author}
          </Link>
          <span>· {set.publishedLabel}</span>
          <span>
            · {set.presentCount} plate{set.presentCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* pillClasses is tuned for dense rows of chips (26px tall); this
              one is a real navigation target, so below `sm:` it takes the
              44px floor and above it stays a pill — WCAG 2.5.5's 44px is a
              touch criterion, and a mouse gets 2.5.8's 24px, which the bare
              pill already clears. Only min-h is added, never a competing
              px-*: pillClasses already sets padding, and two conflicting
              spacing utilities in one class string resolve by stylesheet
              order, not by who was written last. Same string as the chips on
              /artwork/[id], /artist/[slug] and /era/[id]. */}
          <Link
            href={`/era/${era.id}`}
            className={`${pillClasses} min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0`}
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
        {zipEntryCount > 0 && (
          <>
            <p className="mt-4">
              <a
                href={`/api/collections/${set.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
              >
                Download all {zipEntryCount} plates (.zip)
              </a>
            </p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {zipEntryCount} AVIF files at {ZIP_VARIANT_WIDTH.toLocaleString("en-US")} px wide,
              plus a <code>README.txt</code> with a credit line and link per plate. Streamed as it
              is built, so there is no progress bar.
              {zipCapped
                ? ` The archive is capped at ${ZIP_MAX_ENTRIES} plates; the rest download individually from their own pages.`
                : ""}{" "}
              For one plate at full scan resolution, use the download panel on its own page.
            </p>
          </>
        )}
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
        {/* A 24px-row problem on phones, fixed once on the <ol>: the
            row geometry is stated once on the <ol> as child selectors rather
            than repeated in a class attribute on all 435 <li>s, where it
            would cost tens of KB of HTML for one identical rule. Each link
            fills its cell (flex + min-h-11 = the 44px touch floor) and a hair
            line under every row keeps two adjacent targets distinguishable. */}
        <ol className="grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2 lg:grid-cols-3 [&>li]:border-b [&>li]:border-[var(--border)] [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:gap-x-1.5 [&_a]:py-2">
          {set.plates.map((plate) => (
            <li key={plate.listing.id}>
              <Link
                href={artworkHref(plate.listing.id, scope)}
                className="rounded-sm underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                  {plate.plateNumber ?? "—"}
                </span>
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
