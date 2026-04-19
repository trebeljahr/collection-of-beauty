import Link from "next/link";
import { notFound } from "next/navigation";
import { getArtwork, getArtist, getArtworksByArtist, artworks } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { ArtworkCard } from "@/components/artwork-card";
import { assetUrl } from "@/lib/utils";

type Params = { id: string };

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
      <div className="mb-6 flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <Link href="/" className="hover:underline">
          ← Back to gallery
        </Link>
        <div className="flex items-center gap-3">
          {prev && (
            <Link
              href={`/artwork/${prev.id}`}
              className="hover:underline"
              title={prev.title}
            >
              ← Previous
            </Link>
          )}
          {next && (
            <Link
              href={`/artwork/${next.id}`}
              className="hover:underline"
              title={next.title}
            >
              Next →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <a
            href={assetUrl(art.objectKey)}
            target="_blank"
            rel="noreferrer"
            title="Open original"
          >
            <img
              src={assetUrl(art.objectKey)}
              alt={art.title}
              className="mx-auto max-h-[80vh] w-auto rounded-md"
            />
          </a>
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
            {art.dateCreated && (
              <p className="text-[var(--muted-foreground)]">{art.dateCreated}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {art.movement && (
              <Badge variant="secondary">{art.movement}</Badge>
            )}
            {art.nationality && (
              <Badge variant="outline">{art.nationality}</Badge>
            )}
            <Badge variant="outline">{art.license}</Badge>
          </div>

          {art.description && (
            <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
              {art.description}
            </p>
          )}

          <div className="rounded-lg border border-[var(--border)] p-4 text-xs text-[var(--muted-foreground)]">
            <div>
              <span className="font-medium text-[var(--foreground)]">
                Source:
              </span>{" "}
              <a
                className="underline"
                href={art.commonsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Wikimedia Commons
              </a>
            </div>
            {art.credit && (
              <div className="mt-1">
                <span className="font-medium text-[var(--foreground)]">
                  Credit:
                </span>{" "}
                {art.credit.slice(0, 220)}
                {art.credit.length > 220 ? "..." : ""}
              </div>
            )}
          </div>
        </aside>
      </div>

      {moreByArtist.length > 0 && art.artist && (
        <section className="mt-16">
          <h2 className="mb-4 font-serif text-xl">
            More by {art.artist}
          </h2>
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
