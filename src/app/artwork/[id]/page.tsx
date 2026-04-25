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
 * `art.credit` from Commons' source.credit is often "Own work" or a
 * gallery/auction reference — not the artist (the artist is already
 * shown above), so we only render it when it adds information.
 */
function AttributionBlock({ artwork }: { artwork: Artwork }) {
  const credit = meaningfulCredit(artwork.credit);
  const titleText = artwork.title;
  const author = artwork.artist ?? "Unknown artist";

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
      {credit && (
        <p className="mt-1.5">
          <span className="font-medium text-[var(--foreground)]">Provenance:</span> {credit}
        </p>
      )}
    </div>
  );
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

/** Skip the credit if it's a low-signal Wikimedia placeholder ("Own
 *  work") or an absurdly long blob (HTML scraped wholesale). */
function meaningfulCredit(credit: string | null): string | null {
  if (!credit) return null;
  const c = credit.trim();
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
