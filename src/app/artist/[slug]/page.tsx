import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { PlayLink } from "@/components/play-link";
import { ResponsiveImage } from "@/components/responsive-image";
import { ScopedGallery } from "@/components/scoped-gallery";
import { chipClasses, touchTextLinkClasses } from "@/components/ui/pill";
import { displayTitle } from "@/lib/artwork-format";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import {
  type Artist,
  artists,
  getArtist,
  getArtworksByArtist,
  getConnectionsFor,
} from "@/lib/data";
import { assignEra, type EraId, getEra } from "@/lib/gallery-eras";
import { artistRedirect } from "@/lib/redirects";
import { artistJsonLd, buildOpenGraph, jsonLdScriptProps, ogImagesForArtist } from "@/lib/seo";
import { sourceLabel } from "@/lib/source-label";
import { cn } from "@/lib/utils";

type Params = { slug: string };

// Artist pages are pure functions of the generated data — no request-time
// input beyond the slug — so the rendered HTML can be cached for a day
// (matching the sitemap's revalidate) instead of being rebuilt per request.
// Matters most for the ~200 slugs below the generateStaticParams cutoff,
// which were rendering on demand at 1–2 s TTFB.
export const revalidate = 86400;

// Prebuild artist pages that have at least a small body of work — the
// artists most likely to be linked from the home grid, OG previews, or
// search results. Single-work / unknown-attribution slugs render on
// demand instead, since their volume is high (~hundreds) and per-page
// traffic is low.
export function generateStaticParams(): Params[] {
  return artists.filter((a) => a.count >= 3).map((a) => ({ slug: a.slug }));
}

const DESCRIPTION_SUFFIX = "Browse their works in the Collection of Beauty.";
/** Below this an audit tool calls the description too short; above it Google
 *  truncates. Both are soft thresholds, hence the ~110/~155 band. */
const DESCRIPTION_MIN = 110;
const DESCRIPTION_MAX = 155;

/**
 * Meta description for an artist page.
 *
 * The identity line (`N works by X` · lifespan · nationality · movement)
 * clears 110 characters only for artists whose record is fully populated —
 * 182 of 331 pages fell short of it, nearly all of them missing born/died,
 * nationality *and* movement, which collapses the line to ~70 characters.
 *
 * Rather than pad with boilerplate, widen the sparse case with facts the
 * corpus already holds about that artist's works: the movement the works
 * themselves are tagged with, the gallery era they land in, the date span,
 * the single work's title, the upstream source. Each fact is appended only
 * if it still fits under the truncation cap, so the prolific artists (whose
 * identity line is already long) are left exactly as they were.
 */
function artistDescription(artist: Artist): string {
  const lifespan =
    artist.born && artist.died
      ? `${artist.born}–${artist.died}`
      : artist.born
        ? `b. ${artist.born}`
        : null;

  const bits = [
    `${artist.count} work${artist.count === 1 ? "" : "s"} by ${artist.name}`,
    lifespan,
    artist.nationality,
    artist.movement,
  ].filter((bit): bit is string => !!bit);

  const compose = (parts: string[]) => `${parts.join(" · ")}. ${DESCRIPTION_SUFFIX}`;
  if (compose(bits).length >= DESCRIPTION_MIN) return compose(bits);

  const works = getArtworksByArtist(artist.slug);

  // Movement only when the artist record has none and the works agree on
  // one — a split set ("Ukiyo-e" + "Shin-hanga") isn't an artist-level fact.
  const workMovements = [...new Set(works.map((w) => w.movement).filter((m): m is string => !!m))];
  const inferredMovement = artist.movement || workMovements.length !== 1 ? null : workMovements[0];

  // Dominant era rather than the header's 5%-threshold list: one bit has to
  // carry the whole claim, so the era holding the most works is the honest
  // one to name.
  const eraCounts = new Map<EraId, number>();
  for (const w of works) {
    const id = assignEra(w);
    if (id) eraCounts.set(id, (eraCounts.get(id) ?? 0) + 1);
  }
  let dominantEra: EraId | null = null;
  for (const [id, n] of eraCounts) {
    if (dominantEra === null || n > (eraCounts.get(dominantEra) ?? 0)) dominantEra = id;
  }
  const eraTitle = dominantEra ? getEra(dominantEra).title : null;
  // "Renaissance · Renaissance & Mannerism era" says the same thing twice.
  const movement = artist.movement ?? inferredMovement;
  const eraBit =
    eraTitle && !(movement && eraTitle.toLowerCase().includes(movement.toLowerCase()))
      ? `${eraTitle} era`
      : null;

  const span =
    artist.minYear && artist.maxYear
      ? artist.minYear === artist.maxYear
        ? `dated ${artist.minYear}`
        : `dated ${artist.minYear}–${artist.maxYear}`
      : null;
  const single = artist.count === 1 ? (works[0] ?? null) : null;
  const sources = [...new Set(works.map((w) => sourceLabel(w.commonsUrl)))];

  const push = (bit: string | null): boolean => {
    if (!bit || compose([...bits, bit]).length > DESCRIPTION_MAX) return false;
    bits.push(bit);
    return true;
  };

  push(inferredMovement);
  push(eraBit);
  // A one-work artist is better described by that work's title than by its
  // year — fall back to the bare date only when the title doesn't fit.
  const titleBit = single
    ? `“${displayTitle(single)}”${single.year ? ` (${single.year})` : ""}`
    : null;
  if (!push(titleBit)) push(span);
  if (sources.length === 1) push(`from ${sources[0]}`);

  return compose(bits);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const artist = getArtist(slug);
  if (!artist) {
    return { title: "Artist not found" };
  }

  const description = artistDescription(artist);
  // Same path as og:url below — Ahrefs flags any drift between the two.
  const canonical = `/artist/${artist.slug}`;

  return {
    title: artist.name,
    description,
    alternates: { canonical },
    // Via buildOpenGraph: a bare literal here replaces the root layout's
    // openGraph wholesale, dropping og:url, og:site_name and og:image.
    openGraph: buildOpenGraph({
      type: "profile",
      url: canonical,
      title: `${artist.name} · Collection of Beauty`,
      description,
      images: ogImagesForArtist(artist),
    }),
    twitter: {
      card: "summary_large_image",
      title: `${artist.name} · Collection of Beauty`,
      description,
      images: ogImagesForArtist(artist),
    },
  };
}

export default async function ArtistPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const artist = getArtist(slug);
  if (!artist) {
    // Renamed ids and near-miss spellings resolve before the 404 does.
    const target = artistRedirect(slug);
    if (target?.permanent) permanentRedirect(target.href);
    if (target) redirect(target.href);
    notFound();
  }

  // Full works array stays server-side for the era-line derivation
  // below — only its length + per-work movement/year is needed there.
  // The wire payload to the client gallery is the slim first page
  // produced by getArtworkListingPage, so big-output artists (Audubon
  // ≈435 works, Monet ≈368) don't ship their full catalogue via RSC.
  const works = getArtworksByArtist(slug).sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999));
  const initialPage = getArtworkListingPage({
    artistSlug: slug,
    sort: "year",
    limit: DEFAULT_ARTWORK_PAGE_SIZE,
  });
  const connections = getConnectionsFor(slug);
  const connected = connections
    .map((c) => {
      const other = c.source === slug ? c.target : c.source;
      const a = getArtist(other);
      return a ? { artist: a, label: c.label, kind: c.kind } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.artist.count - a.artist.count);

  const known = connected.filter((c) => c.kind === "known");
  // Every "movement" edge is "shared movement: <this artist's movement>",
  // so the list is the rest of that movement, not people alive at the same
  // time: Serov and Chase sit on Monet's. The most-represented 24 are kept,
  // then read in birth order so the dates beside each name line up.
  const sameMovement = connected
    .filter((c) => c.kind === "movement")
    .slice(0, 24)
    .sort((a, b) => (a.artist.born ?? 99999) - (b.artist.born ?? 99999));

  // Most artists land in one era; a few span two (Monet → fin-de-siècle
  // + modern). Preserve era chronological order so the line reads
  // earliest → latest, mirroring the works grid below. Drop eras
  // representing <5% of the artist's works — keeps real career-spanning
  // splits (Sargent's portrait/landscape, Gauguin's pre/post-1886) but
  // suppresses outlier-only eras (e.g. Van Gogh's 2 Dutch-Realism works
  // out of 56, which would otherwise read as "Van Gogh = Realism" in
  // the header).
  const eraCounts = new Map<EraId, number>();
  for (const w of works) {
    const id = assignEra({ movement: w.movement, year: w.year });
    if (id) eraCounts.set(id, (eraCounts.get(id) ?? 0) + 1);
  }
  const eraThreshold = Math.max(1, works.length * 0.05);
  const eraIds: EraId[] = [];
  for (const w of works) {
    const id = assignEra({ movement: w.movement, year: w.year });
    if (id && (eraCounts.get(id) ?? 0) >= eraThreshold && !eraIds.includes(id)) {
      eraIds.push(id);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script {...jsonLdScriptProps(artistJsonLd(artist))} />
      <Link
        href="/artists"
        className={`${touchTextLinkClasses} text-sm text-[var(--muted-foreground)]`}
      >
        ← All artists
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-2">
        {/* Wraps under the name when the two don't fit on one line, which
            on a phone is most names. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h1 className="font-serif text-3xl md:text-4xl">{artist.name}</h1>
          <PlayLink scope={{ kind: "artist", slug: artist.slug }} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[var(--muted-foreground)]">
          {artist.born && artist.died && (
            <span>
              {artist.born}–{artist.died}
              {` (age ${artist.died - artist.born})`}
            </span>
          )}
          {artist.nationality && <span>· {artist.nationality}</span>}
          {artist.movement && <span>· {artist.movement}</span>}
          <span>
            · {artist.count} work{artist.count === 1 ? "" : "s"}
          </span>
        </div>
        {/* The gutter opens to gap-2 at exactly the breakpoint where
            chipClasses drops its 44px floor, so the taller touch pills read
            as separate targets rather than one slab; above `sm:` the row
            returns to its original dense 1.5 gutter. The contemporaries
            grids further down already sit at gap-2 at every width. */}
        {eraIds.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-1.5">
            {eraIds.map((id) => (
              <Link key={id} href={`/era/${id}`} className={chipClasses}>
                {getEra(id).title}
              </Link>
            ))}
          </div>
        )}
      </header>

      {known.length > 0 && (
        <section className="mb-10">
          <h2 className={sectionHeadingClasses}>Knew personally</h2>
          {/* The label says how they knew each other. It used to sit in a
              title tooltip, which a touch screen never shows. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {known.map((c) => (
              <li key={c.artist.slug}>
                <Link
                  href={`/artist/${c.artist.slug}`}
                  className="flex h-full gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <ArtistThumb artist={c.artist} className="size-16 rounded-md" />
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{c.artist.name}</p>
                    <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
                      {lifespanLabel(c.artist)}
                    </p>
                    <p className="mt-1.5 text-sm leading-snug text-[var(--muted-foreground)]">
                      {sentenceCase(c.label)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {artist.movement && sameMovement.length > 0 && (
        <section className="mb-10">
          <h2 className={sectionHeadingClasses}>More {artist.movement}</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {sameMovement.map((c) => (
              <li key={c.artist.slug}>
                <Link
                  href={`/artist/${c.artist.slug}`}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <ArtistThumb artist={c.artist} className="size-10 rounded-full" />
                  <span className="min-w-0">
                    <span className="block text-sm leading-snug font-medium">{c.artist.name}</span>
                    <span className="block text-xs tabular-nums text-[var(--muted-foreground)]">
                      {lifespanLabel(c.artist)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-serif text-xl">Works in this collection</h2>
        <ScopedGallery
          initialArtworks={initialPage.items}
          initialPageInfo={{
            total: initialPage.total,
            nextOffset: initialPage.nextOffset,
            hasMore: initialPage.hasMore,
          }}
          scope={{ kind: "artist", slug: artist.slug }}
          pageQuery={{ artistSlug: artist.slug, sort: "year" }}
        />
      </section>
    </div>
  );
}

const sectionHeadingClasses =
  "mb-3 text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]";

function lifespanLabel(artist: Artist): string | null {
  if (artist.born && artist.died) return `${artist.born}–${artist.died}`;
  if (artist.born) return `b. ${artist.born}`;
  return null;
}

/** The connection labels are written lower-case to read mid-sentence
 *  ("painted side-by-side at La Grenouillère"); here each starts a line. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The artist's cover work, cropped to a small square or circle. Decorative:
 *  the name beside it is the link text. */
function ArtistThumb({ artist, className }: { artist: Artist; className: string }) {
  // A cover crop of a wide work draws wider than its 64px box; ask for
  // enough pixels to fill it (coverSizes does the same for `vw` hints).
  const overhang = artist.coverFit === "contain" ? 1 : Math.max(1, artist.coverAspect ?? 1);
  const thumbWidth = Math.ceil(64 * overhang);
  return (
    <span
      aria-hidden
      className={cn("relative shrink-0 overflow-hidden bg-[var(--muted)]", className)}
    >
      {artist.coverObjectKey && (
        <ResponsiveImage
          objectKey={artist.coverObjectKey}
          variantWidths={artist.coverVariantWidths}
          alt=""
          fill
          sizes={`${thumbWidth}px`}
          loading="lazy"
          className={cn(artist.coverFit === "contain" && "object-contain p-1")}
          style={artist.coverPosition ? { objectPosition: artist.coverPosition } : undefined}
        />
      )}
    </span>
  );
}
