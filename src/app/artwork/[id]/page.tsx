import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArtworkCard } from "@/components/artwork-card";
import { ArtworkViewer } from "@/components/artwork-viewer";
import { LicenseBadge } from "@/components/license-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  type Artwork,
  artworks,
  displayTitle,
  getArtist,
  getArtwork,
  getArtworkListingsByArtist,
} from "@/lib/data";
import { getLicenseInfo } from "@/lib/license";
import { suggestFixUrl } from "@/lib/links";
import { isNsfwArtwork } from "@/lib/nsfw";
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

export default async function ArtworkPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const art = getArtwork(id);
  if (!art) notFound();

  const artist = art.artistSlug ? getArtist(art.artistSlug) : null;
  const moreByArtist = art.artistSlug
    ? getArtworkListingsByArtist(art.artistSlug)
        .filter((a) => a.id !== art.id)
        .slice(0, 12)
    : [];

  const idx = artworks.findIndex((a) => a.id === art.id);
  const prev = idx > 0 ? artworks[idx - 1] : null;
  const next = idx < artworks.length - 1 ? artworks[idx + 1] : null;
  const displayed = displayTitle(art);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script {...jsonLdScriptProps(artworkJsonLd(art))} />
      <div className="mb-6 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <Link
          href="/"
          className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          ← Back to gallery
        </Link>
        <div className="flex items-center gap-3">
          {prev && (
            <Link
              href={`/artwork/${prev.id}`}
              className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              title={displayTitle(prev)}
            >
              ← Previous
            </Link>
          )}
          {next && (
            <Link
              href={`/artwork/${next.id}`}
              className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              title={displayTitle(next)}
            >
              Next →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div className="flex min-h-[80vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)] p-[5px]">
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
              nsfw: isNsfwArtwork(art),
            }}
            prevId={prev?.id ?? null}
            nextId={next?.id ?? null}
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
            {art.movement && <Badge variant="secondary">{art.movement}</Badge>}
            {art.nationality && <Badge variant="outline">{art.nationality}</Badge>}
            <LicenseBadge license={art.license} />
          </div>

          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            {art.description ?? generatedByline(art)}
          </p>

          <AttributionBlock artwork={art} />

          <div>
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {moreByArtist.map((a) => (
              <ArtworkCard key={a.id} artwork={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Wikimedia Commons attribution block in TASL order — Title, Author,
 * Source, License — per the Commons reuse guidelines:
 *   https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
 *
 * Provenance now comes from Wikidata when available (collection,
 * inventory, museum page URL); otherwise we fall back to source links
 * scraped from the Commons file page, and finally to the legacy raw
 * `credit` string with footnote refs cleaned up.
 */
function AttributionBlock({ artwork }: { artwork: Artwork }) {
  const titleText = displayTitle(artwork);
  const author = artwork.artist ?? "Unknown artist";
  const prov = artwork.provenance;
  const fallbackCredit = !prov ? meaningfulCredit(artwork.credit) : null;

  return (
    <div className="rounded-lg border border-[var(--border)] p-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
      <p className="text-[var(--foreground)]">
        “{titleText}”{author ? <> by {author}</> : null}
        {artwork.year ? <>, {artwork.year}</> : null}.
      </p>
      <p className="mt-1.5">
        Available under <LicenseInline license={artwork.license} />, via{" "}
        <a
          href={artwork.commonsUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          Wikimedia Commons
        </a>
        .
      </p>
      {prov && <ProvenanceBlock prov={prov} />}
      {fallbackCredit && (
        <p className="mt-1.5">
          <span className="font-medium text-[var(--foreground)]">Provenance:</span>{" "}
          {/^https?:\/\//.test(fallbackCredit) ? (
            <ExternalLink href={fallbackCredit}>{hostnameOf(fallbackCredit)}</ExternalLink>
          ) : (
            fallbackCredit
          )}
        </p>
      )}
    </div>
  );
}

function ProvenanceBlock({ prov }: { prov: NonNullable<Artwork["provenance"]> }) {
  // The collection name is often the same string as the location (e.g.
  // both are "Cleveland Museum of Art"). Avoid showing it twice.
  const showLocation = prov.location && prov.location !== prov.collection;
  const hasStructured = prov.collection || prov.inventory || prov.describedAt || showLocation;
  const hasLinks = prov.sourceLinks.length > 0;
  if (!hasStructured && !hasLinks && !prov.wikidataUrl) return null;

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
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

function LicenseInline({ license }: { license: string | null | undefined }) {
  // Inline link variant — same target as the LicenseBadge above, but
  // styled as flowing text inside the attribution sentence.
  const info = getLicenseInfo(license);
  return (
    <a
      href={info.url}
      target="_blank"
      rel="license noreferrer"
      className="rounded-sm underline underline-offset-2 hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {info.short}
    </a>
  );
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
