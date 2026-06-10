import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArtworkCard } from "@/components/artwork-card";
import { ArtworkViewer } from "@/components/artwork-viewer";
import { LicenseBadge } from "@/components/license-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { artworkHref, parseScope, resolveScope, scopeHref, scopeLabel } from "@/lib/artwork-scope";
import {
  type Artwork,
  artworks,
  displayTitle,
  getArtist,
  getArtwork,
  getArtworksByArtist,
} from "@/lib/data";
import { assignEra, getEra } from "@/lib/gallery-eras";
import { suggestFixUrl } from "@/lib/links";
import { artworkJsonLd, jsonLdScriptProps, ogImagesForArtwork } from "@/lib/seo";

type Params = { id: string };

// Prebuild the most-likely-to-be-hit artwork pages so first paint on
// shared/featured works is instant; the rest render on demand and get
// cached at the edge from then on. Picking "has a known artist with
// ≥5 works AND has a year AND has variant widths" as a cheap proxy
// for "page worth prerendering" — it correlates with works that
// actually show on the home grid, get linked from artist pages, or
// land in OG previews. Caps the prebuilt set so the build doesn't
// fan out to all 2,947 pages.
const STATIC_PARAMS_CAP = 250;
export function generateStaticParams(): Params[] {
  return artworks
    .filter((a) => a.year != null && a.artist != null && a.variantWidths != null)
    .slice(0, STATIC_PARAMS_CAP)
    .map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const art = getArtwork(id);
  if (!art) {
    return { title: "Artwork not found" };
  }

  const bylineBits = [
    art.artist,
    art.dateCreated ?? (art.year ? String(art.year) : null),
    art.movement,
  ].filter(Boolean);
  const byline = bylineBits.join(" · ");
  const displayed = displayTitle(art);
  const title = art.artist ? `${displayed} — ${art.artist}` : displayed;
  const description = art.description
    ? `${art.description}${byline ? ` (${byline})` : ""}`
    : byline
      ? `${displayed} — ${byline}. From the Collection of Beauty, a public-domain art gallery.`
      : `${displayed}. From the Collection of Beauty, a public-domain art gallery.`;

  const images = ogImagesForArtwork(art);

  return {
    title,
    description,
    alternates: { canonical: `/artwork/${art.id}` },
    openGraph: {
      type: "article",
      title,
      description,
      images,
      ...(art.artist ? { authors: [art.artist] } : {}),
      ...(art.dateCreated ? { publishedTime: art.dateCreated } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}

export default async function ArtworkPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const art = getArtwork(id);
  if (!art) notFound();

  const artist = art.artistSlug ? getArtist(art.artistSlug) : null;
  const moreByArtist = art.artistSlug
    ? getArtworksByArtist(art.artistSlug)
        .filter((a) => a.id !== art.id)
        .slice(0, MORE_FROM_ERA_COUNT)
    : [];

  // Pick prev/next from the scoped list when a valid scope was supplied
  // AND the current artwork is in it. Anything else (no scope, scope
  // malformed, current id not present in scope) falls back to the
  // global pool — same behaviour as before the scope feature.
  const scope = parseScope(from ?? null);
  const scopedList = scope ? resolveScope(scope) : null;
  const scopedIdx = scopedList != null ? scopedList.findIndex((a) => a.id === art.id) : -1;
  const useScoped = scopedList != null && scopedIdx >= 0;

  let prevId: string | null;
  let nextId: string | null;
  if (useScoped && scopedList) {
    prevId = scopedIdx > 0 ? scopedList[scopedIdx - 1].id : null;
    nextId = scopedIdx < scopedList.length - 1 ? scopedList[scopedIdx + 1].id : null;
  } else {
    const idx = artworks.findIndex((a) => a.id === art.id);
    prevId = idx > 0 ? artworks[idx - 1].id : null;
    nextId = idx < artworks.length - 1 ? artworks[idx + 1].id : null;
  }

  const navScope = useScoped ? scope : null;
  const displayed = displayTitle(art);

  // Era surfacing: same priority order the 3D gallery uses (movement
  // first, then year). Null when neither lands — badge + section both
  // hide rather than render an empty rail.
  const eraId = assignEra({ movement: art.movement, year: art.year });
  const era = eraId ? getEra(eraId) : null;
  const eraPool = eraId
    ? resolveScope({ kind: "era", id: eraId }).filter(
        (a) => a.id !== art.id && a.artistSlug !== art.artistSlug,
      )
    : [];
  // Deterministic per-artwork sample so the same id always surfaces
  // the same neighbours — predictable, cacheable, no hydration churn.
  const moreFromEra = sampleStable(eraPool, MORE_FROM_ERA_COUNT, art.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script {...jsonLdScriptProps(artworkJsonLd(art))} />
      <div className="mb-6 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        {navScope ? (
          <Link
            href={scopeHref(navScope)}
            className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            ← Back to {scopeLabel(navScope)}
          </Link>
        ) : (
          <Link
            href="/"
            className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            ← Back to gallery
          </Link>
        )}
        <div className="flex items-center gap-3">
          {prevId && (
            <Link
              href={artworkHref(prevId, navScope)}
              className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              ← Previous
            </Link>
          )}
          {nextId && (
            <Link
              href={artworkHref(nextId, navScope)}
              className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Next →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div className="flex max-h-[85vh] flex-col self-start rounded-xl border border-[var(--border)] bg-[var(--muted)] p-[10px]">
          <ArtworkViewer
            art={{
              id: art.id,
              objectKey: art.objectKey,
              variantWidths: art.variantWidths,
              title: art.title,
              englishTitle: art.englishTitle,
              artist: art.artist,
              year: art.year,
              width: art.width,
              height: art.height,
            }}
            prevId={prevId}
            nextId={nextId}
            scope={navScope}
          />
        </div>

        <aside className="space-y-5">
          <div className="space-y-1">
            <h1 className="font-serif text-2xl md:text-3xl">{displayed}</h1>
            {art.englishTitle && art.englishTitle !== art.title && (
              <p className="font-serif text-base italic text-[var(--muted-foreground)]" lang="ja">
                {art.title}
              </p>
            )}
            {art.artist && (
              <p className="text-lg">
                <Link
                  href={`/artist/${art.artistSlug}`}
                  className="rounded-sm underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {art.artist}
                </Link>
                {artist?.born && artist?.died && (
                  <span className="text-[var(--muted-foreground)]">
                    {" "}
                    ({artist.born}–{artist.died})
                  </span>
                )}
              </p>
            )}
            {art.dateCreated && (
              <p className="text-[var(--muted-foreground)]">
                {art.dateCreated}
                {art.originalDateString && art.originalDateString !== art.dateCreated && (
                  <span className="ml-2 italic">({art.originalDateString})</span>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {era && (
              <Link
                href={`/era/${era.id}`}
                className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Badge variant="outline">{era.title}</Badge>
              </Link>
            )}
            <LicenseBadge license={art.license} />
            <CommonsBadge href={art.commonsUrl} />
          </div>

          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            {art.description ?? generatedByline(art)}
          </p>

          <ProvenanceSection artwork={art} />

          <div>
            <p className="mb-2 text-xs text-[var(--muted-foreground)]">
              Metadata is imperfect — corrections welcome.
            </p>
            <a
              href={suggestFixUrl({
                id: art.id,
                title: displayed,
                artist: art.artist,
                sourceUrl: art.commonsUrl,
              })}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <GitHubIcon />
              Suggest a fix
            </a>
          </div>
        </aside>
      </div>

      {moreByArtist.length > 0 && art.artist && (
        <section className="mt-16">
          <h2 className="mb-4 font-serif text-xl">More by {art.artist}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {moreByArtist.map((a, i) => (
              <div key={a.id} className={singleRowVisibility(i)}>
                <ArtworkCard artwork={a} scope={{ kind: "artist", slug: art.artistSlug }} />
              </div>
            ))}
          </div>
        </section>
      )}

      {era && eraId && moreFromEra.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-4 font-serif text-xl">More from {era.title} by other artists</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {moreFromEra.map((a, i) => (
              <div key={a.id} className={singleRowVisibility(i)}>
                <ArtworkCard artwork={a} scope={{ kind: "era", id: eraId }} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Cards rendered in the "More from this era" rail. Six fits the 6-col
// grid at lg cleanly; bumping to 8 leaves a short second row on most
// pages without enough payoff.
const MORE_FROM_ERA_COUNT = 6;

/** Hide overflow cards so the rail stays one row at every breakpoint.
 *  Grid is 1 / 3 / 4 / 6 cols at base / sm / md / lg respectively. */
function singleRowVisibility(index: number): string {
  if (index < 1) return "";
  if (index < 3) return "hidden sm:block";
  if (index < 4) return "hidden md:block";
  return "hidden lg:block";
}

/** FNV-1a 32-bit hash — matches the algorithm used by
 *  `gallery-eras.ts#roomFloorColor`, kept inline to avoid widening that
 *  module's public surface. Returns an unsigned 32-bit int. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick `count` items from `pool` deterministically based on `seed`.
 *  Strided pick spreads the selection across the pool so the same
 *  artwork always shows the same neighbours, and the sample reads as
 *  representative of the era rather than clustered. */
function sampleStable<T>(pool: T[], count: number, seed: string): T[] {
  if (pool.length <= count) return pool.slice();
  const stride = Math.max(1, Math.floor(pool.length / count));
  const offset = fnv1a(seed) % pool.length;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(offset + i * stride) % pool.length]);
  }
  return out;
}

/**
 * Provenance — Wikidata-sourced collection / inventory / museum page
 * when available, otherwise falls back to source links from the
 * Commons file page, and finally to the legacy raw `credit` string
 * with footnote refs cleaned up. Renders nothing when there is
 * nothing meaningful to show.
 *
 * Wikimedia Commons reuse attribution (TASL — Title, Author, Source,
 * License) is satisfied by the page header (title + artist), the
 * License badge, and the Commons source badge — no need to restate
 * any of those here.
 */
function ProvenanceSection({ artwork }: { artwork: Artwork }) {
  const prov = artwork.provenance;
  const fallbackCredit = !prov ? meaningfulCredit(artwork.credit) : null;

  if (prov) return <ProvenanceBlock prov={prov} />;
  if (fallbackCredit) {
    return (
      <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
        <span className="font-medium text-[var(--foreground)]">Provenance:</span>{" "}
        {/^https?:\/\//.test(fallbackCredit) ? (
          <ExternalLink href={fallbackCredit}>{hostnameOf(fallbackCredit)}</ExternalLink>
        ) : (
          fallbackCredit
        )}
      </p>
    );
  }
  return null;
}

function ProvenanceBlock({ prov }: { prov: NonNullable<Artwork["provenance"]> }) {
  // The collection name is often the same string as the location (e.g.
  // both are "Cleveland Museum of Art"). Avoid showing it twice.
  const showLocation = prov.location && prov.location !== prov.collection;
  const hasStructured = prov.collection || prov.inventory || prov.describedAt || showLocation;
  const hasLinks = prov.sourceLinks.length > 0;
  if (!hasStructured && !hasLinks && !prov.wikidataUrl) return null;

  return (
    <div className="text-xs leading-relaxed text-[var(--muted-foreground)]">
      <p className="mb-1.5 font-medium text-[var(--foreground)]">Provenance</p>
      {prov.collection && (
        <p>
          <span className="text-[var(--foreground)]">Collection:</span> {prov.collection}
          {prov.inventory ? <> · acc. {prov.inventory}</> : null}
        </p>
      )}
      {showLocation && (
        <p>
          <span className="text-[var(--foreground)]">Location:</span> {prov.location}
        </p>
      )}
      {prov.describedAt && (
        <p>
          <span className="text-[var(--foreground)]">Museum page:</span>{" "}
          <ExternalLink href={prov.describedAt}>{hostnameOf(prov.describedAt)}</ExternalLink>
        </p>
      )}
      {hasLinks && (
        <p>
          <span className="text-[var(--foreground)]">See also:</span>{" "}
          {prov.sourceLinks.map((link, i) => (
            <span key={link.url}>
              {i > 0 ? ", " : null}
              <ExternalLink href={link.url}>{link.label}</ExternalLink>
            </span>
          ))}
        </p>
      )}
      {prov.wikidataUrl && (
        <p className="mt-1.5">
          <ExternalLink href={prov.wikidataUrl}>View on Wikidata ({prov.wikidataId})</ExternalLink>
        </p>
      )}
    </div>
  );
}

/** Pill linking to the Wikimedia Commons file page — the "Source" leg
 *  of TASL attribution, styled to sit next to LicenseBadge. */
function CommonsBadge({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="View source on Wikimedia Commons"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
    >
      Wikimedia Commons
      <svg
        viewBox="0 0 24 24"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
    </a>
  );
}

function GitHubIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.91 10.91 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {children}
    </a>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Clean up the Wikimedia source.credit before display. The raw field
 *  often contains orphaned footnote refs (`[1]`, `[2]`) — copied out of
 *  Wikipedia's References section without the numbered targets — and
 *  stranded Wikidata QS templates (`wga QS:P11807,"..."`). Returns null
 *  when nothing readable survives, so the caller can hide the row
 *  entirely instead of rendering "Provenance: [2]". */
function meaningfulCredit(credit: string | null): string | null {
  if (!credit) return null;
  let c = credit.trim();
  if (!c) return null;

  // Footnote refs, anywhere in the string.
  c = c.replace(/\[\d+\]/g, "");

  // Wikidata QS-claim templates, e.g.
  //   wga QS:P11807,"w/weyden/rogier/05sevens/0sevens"
  //   label QS:Len,"Foo"
  // These are machine-readable assertions, not human credit.
  c = c.replace(/\b(?:wga\s+|label\s+)?QS:[A-Z]\w*,\s*"[^"]*"/gi, "");

  // Tidy stranded punctuation/whitespace the strips leave behind:
  // "  ,  ", " . ;", trailing junk.
  c = c.replace(/\s+/g, " ");
  c = c.replace(/\s+([,;.:])/g, "$1");
  c = c.replace(/([,;:.])\s*([,;:.])/g, "$2");
  c = c.replace(/^[\s,;:.]+|[\s,;:.]+$/g, "").trim();

  // Connectives that only meant something paired with the stripped
  // ref ("Cropped from [1]" → "Cropped from").
  if (/^(?:cropped from|source|see|via|from|and)$/i.test(c)) return null;

  if (!c) return null;
  if (/^own\s*work$/i.test(c)) return null;
  if (c.length > 320) return `${c.slice(0, 317)}…`;
  return c;
}

/** Used as a description fallback when the source had no description.
 *  Composes a short factual sentence from the fields we always have so
 *  every detail page has SOME prose under the title. */
function generatedByline(a: Artwork): string {
  const parts: string[] = [];
  if (a.artist && a.year) {
    parts.push(`Painted by ${a.artist} in ${a.year}.`);
  } else if (a.artist) {
    parts.push(`Work by ${a.artist}.`);
  } else if (a.year) {
    parts.push(`Created in ${a.year}.`);
  }
  if (a.movement) {
    parts.push(`Part of the ${a.movement} movement.`);
  }
  if (a.realDimensions) {
    parts.push(
      `Original dimensions ${a.realDimensions.widthCm.toFixed(0)} × ${a.realDimensions.heightCm.toFixed(0)} cm.`,
    );
  }
  return parts.length > 0
    ? parts.join(" ")
    : "From the Collection of Beauty — a public-domain art gallery.";
}
