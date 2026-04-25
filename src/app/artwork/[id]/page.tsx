import { ArtworkCard } from "@/components/artwork-card";
import { ArtworkViewer } from "@/components/artwork-viewer";
import { Badge } from "@/components/ui/badge";
import { artworks, getArtist, getArtwork, getArtworksByArtist } from "@/lib/data";
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

          <div className="flex flex-wrap gap-2">
            {art.movement && <Badge variant="secondary">{art.movement}</Badge>}
            {art.nationality && <Badge variant="outline">{art.nationality}</Badge>}
            <Badge variant="outline">{art.license}</Badge>
          </div>

          {art.description && (
            <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
              {art.description}
            </p>
          )}

          <div className="rounded-lg border border-[var(--border)] p-4 text-xs text-[var(--muted-foreground)]">
            <div>
              <span className="font-medium text-[var(--foreground)]">Source:</span>{" "}
              <a className="underline" href={art.commonsUrl} target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
            </div>
            {art.credit && (
              <div className="mt-1">
                <span className="font-medium text-[var(--foreground)]">Credit:</span>{" "}
                {art.credit.slice(0, 220)}
                {art.credit.length > 220 ? "..." : ""}
              </div>
            )}
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
