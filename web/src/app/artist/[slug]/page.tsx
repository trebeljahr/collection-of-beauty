import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArtist,
  getArtworksByArtist,
  getConnectionsFor,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { ArtworkCard } from "@/components/artwork-card";

type Params = { slug: string };

export default async function ArtistPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const artist = getArtist(slug);
  if (!artist) notFound();

  const works = getArtworksByArtist(slug).sort(
    (a, b) => (a.year ?? 99999) - (b.year ?? 99999),
  );
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/artists"
        className="text-sm text-[var(--muted-foreground)] hover:underline"
      >
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
          {artist.movement && (
            <Badge variant="secondary">{artist.movement}</Badge>
          )}
          <span>
            · {artist.count} work{artist.count === 1 ? "" : "s"}
          </span>
        </div>
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
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm hover:bg-[var(--accent)]"
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
            Contemporaries in {artist.movement}
          </h2>
          <div className="flex flex-wrap gap-2">
            {contemporaries.slice(0, 24).map((c) => (
              <Link
                key={c.artist.slug}
                href={`/artist/${c.artist.slug}`}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
              >
                {c.artist.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-serif text-xl">Works in this collection</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {works.map((a) => (
            <ArtworkCard key={a.id} artwork={a} />
          ))}
        </div>
      </section>
    </div>
  );
}
