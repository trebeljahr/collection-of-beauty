import { ArtworkCard } from "@/components/artwork-card";
import { ArtworkViewer } from "@/components/artwork-viewer";
import { LicenseBadge } from "@/components/license-badge";
import { Badge } from "@/components/ui/badge";
import { type Artwork, artworks, getArtist, getArtwork, getArtworksByArtist } from "@/lib/data";
import { getLicenseInfo } from "@/lib/license";
import { artworkJsonLd, jsonLdScriptProps, ogImagesForArtwork } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
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
  const title = art.artist ? `${art.title} — ${art.artist}` : art.title;
  const description = art.description
    ? `${art.description}${byline ? ` (${byline})` : ""}`
    : byline
      ? `${art.title} — ${byline}. From the Collection of Beauty, a public-domain art gallery.`
      : `${art.title}. From the Collection of Beauty, a public-domain art gallery.`;

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
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const art = getArtwork(id);
  if (!art) notFound();

  const artist = art.artistSlug ? getArtist(art.artistSlug) : null;
  const moreByArtist = art.artistSlug
    ? getArtworksByArtist(art.artistSlug)
        .filter((a) => a.id !== art.id)
        .slice(0, 12)
    : [];

  const idx = artworks.findIndex((a) => a.id === art.id);
  const prev = idx > 0 ? artworks[idx - 1] : null;
  const next = idx < artworks.length - 1 ? artworks[idx + 1] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script {...jsonLdScriptProps(artworkJsonLd(art))} />
      <div className="mb-6 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <Link href="/" className="hover:underline">
          ← Back to gallery
        </Link>
        <div className="flex items-center gap-3">
          {prev && (
            <Link href={`/artwork/${prev.id}`} className="hover:underline" title={prev.title}>
              ← Previous
            </Link>
          )}
          {next && (
            <Link href={`/artwork/${next.id}`} className="hover:underline" title={next.title}>
              Next →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
          <ArtworkViewer
            art={{
              id: art.id,
              objectKey: art.objectKey,
              variantWidths: art.variantWidths,
              title: art.title,
              artist: art.artist,
              year: art.year,
              width: art.width,
              height: art.height,
            }}
            prevId={prev?.id ?? null}
            nextId={next?.id ?? null}
          />
        </div>

        <aside className="space-y-5">
          <div className="space-y-1">
            <h1 className="font-serif text-2xl md:text-3xl">{art.title}</h1>
            {art.artist && (
              <p className="text-lg">
                <Link
                  href={`/artist/${art.artistSlug}`}
                  className="underline-offset-4 hover:underline"
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
            {art.dateCreated && <p className="text-[var(--muted-foreground)]">{art.dateCreated}</p>}
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
  const titleText = artwork.title;
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
          className="underline underline-offset-2 hover:text-[var(--foreground)]"
        >
          Wikimedia Commons
        </a>
        .
      </p>
      {prov && <ProvenanceBlock prov={prov} />}
      {fallbackCredit && (
        <p className="mt-1.5">
          <span className="font-medium text-[var(--foreground)]">Provenance:</span> {fallbackCredit}
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

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-[var(--foreground)]"
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
      className="underline underline-offset-2 hover:text-[var(--foreground)]"
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
