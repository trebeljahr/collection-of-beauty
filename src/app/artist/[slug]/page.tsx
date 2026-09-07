import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopedGallery } from "@/components/scoped-gallery";
import { pillClasses } from "@/components/ui/pill";
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
import { artistJsonLd, buildOpenGraph, jsonLdScriptProps, ogImagesForArtist } from "@/lib/seo";
import { sourceLabel } from "@/lib/source-label";

type Params = { slug: string };

/* Related-artist / movement / era chips. `min-h-11` is the 44px WCAG
   2.5.5 touch-target minimum — the pill's own type only makes 26px — and
   it is gated to below `sm:` on purpose: 2.5.5 is a *touch* criterion,
   mouse pointers are governed by 2.5.8's 24px, which the bare pill
   already clears. Ungated, the contemporaries grid (up to 24 pills) would
   be two dozen rounded-full slabs on a desktop. Below `sm:` the pill
   itself grows rather than gaining an invisible overflowing hit area,
   because these wrap into multi-row grids where such a target would sit
   on top of the chip in the row above; their rows open to gap-2 at the
   same breakpoint so the taller pills read as separate targets rather
   than one slab. The identical string lives on /artwork/[id], /era/[id]
   and /collection/[slug] — keep the four in step. */
const CHIP = `${pillClasses} min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0`;

/* Bare text links. Same story: 44px below `sm:`, the plain inline anchor
   above it. `-my-3` hands the extra 24px back to layout so the blocks
   around it keep their positions — the enlarged box merely overlaps
   neighbouring lines, none of which are clickable — and `sm:inline`
   returns it to an ordinary inline box. This is the idiom on every page
   that grew a touch target: enlarge the box and overlap, never shrink a
   neighbour's margin. */
const TEXT_LINK =
  "-my-3 inline-flex min-h-11 items-center rounded-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:my-0 sm:inline sm:min-h-0";

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
  if (!artist) notFound();

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
  const contemporaries = connected.filter((c) => c.kind === "movement");

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
      <Link href="/artists" className={`${TEXT_LINK} text-sm text-[var(--muted-foreground)]`}>
        ← All artists
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-2">
        <h1 className="font-serif text-3xl md:text-4xl">{artist.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-[var(--muted-foreground)]">
          {artist.born && artist.died && (
            <span>
              {artist.born}–{artist.died}
              {` (age ${artist.died - artist.born})`}
            </span>
          )}
          {artist.nationality && <span>· {artist.nationality}</span>}
          <span>
            · {artist.count} work{artist.count === 1 ? "" : "s"}
          </span>
        </div>
        {(artist.movement || eraIds.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-1.5">
            {artist.movement && (
              <Link
                href={`/timeline?movement=${encodeURIComponent(artist.movement)}`}
                className={CHIP}
              >
                {artist.movement}
              </Link>
            )}
            {eraIds.map((id) => (
              <Link key={id} href={`/era/${id}`} className={CHIP}>
                {getEra(id).title}
              </Link>
            ))}
          </div>
        )}
      </header>

      {known.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Knew personally
          </h2>
          <div className="flex flex-wrap gap-2">
            {known.map((c) => (
              <Link
                key={c.artist.slug}
                href={`/artist/${c.artist.slug}`}
                className={CHIP}
                title={c.label}
              >
                {c.artist.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {contemporaries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Contemporaries
          </h2>
          <div className="flex flex-wrap gap-2">
            {contemporaries.slice(0, 24).map((c) => (
              <Link key={c.artist.slug} href={`/artist/${c.artist.slug}`} className={CHIP}>
                {c.artist.name}
              </Link>
            ))}
          </div>
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
