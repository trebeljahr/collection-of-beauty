import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { Badge } from "@/components/ui/badge";
import { artists, getArtist, getArtworksByArtist, getConnectionsFor } from "@/lib/data";
import { assignEra, type EraId, getEra } from "@/lib/gallery-eras";
import { artistJsonLd, jsonLdScriptProps, ogImagesForArtist } from "@/lib/seo";

type Params = { slug: string };

// Prebuild artist pages that have at least a small body of work — the
// artists most likely to be linked from the home grid, OG previews, or
// search results. Single-work / unknown-attribution slugs render on
// demand instead, since their volume is high (~hundreds) and per-page
// traffic is low.
export function generateStaticParams(): Params[] {
  return artists.filter((a) => a.count >= 3).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const artist = getArtist(slug);
  if (!artist) {
    return { title: "Artist not found" };
  }

  const lifespan =
    artist.born && artist.died
      ? `${artist.born}–${artist.died}`
      : artist.born
        ? `b. ${artist.born}`
        : null;

  const descriptionBits = [
    `${artist.count} work${artist.count === 1 ? "" : "s"} by ${artist.name}`,
    lifespan,
    artist.nationality,
    artist.movement,
  ].filter(Boolean);
  const description = `${descriptionBits.join(" · ")}. Browse their works in the Collection of Beauty.`;

  return {
    title: artist.name,
    description,
    alternates: { canonical: `/artist/${artist.slug}` },
    openGraph: {
      type: "profile",
      title: `${artist.name} · Collection of Beauty`,
      description,
      images: ogImagesForArtist(artist),
    },
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

  const works = getArtworksByArtist(slug).sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999));
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
      <Link
        href="/artists"
        className="rounded-sm text-sm text-[var(--muted-foreground)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
          {artist.movement && <Badge variant="secondary">{artist.movement}</Badge>}
          <span>
            · {artist.count} work{artist.count === 1 ? "" : "s"}
          </span>
        </div>
        {eraIds.length > 0 && (
          <div className="text-sm text-[var(--muted-foreground)]">
            {eraIds.length === 1 ? "Era: " : "Eras: "}
            {eraIds.map((id, i) => (
              <span key={id}>
                {i > 0 ? " · " : null}
                <Link
                  href={`/era/${id}`}
                  className="rounded-sm underline-offset-2 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {getEra(id).title}
                </Link>
              </span>
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
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {c.artist.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-serif text-xl">Works in this collection</h2>
        <ArtworkGallery
          artworks={works}
          resetKey={artist.slug}
          scope={{ kind: "artist", slug: artist.slug }}
        />
      </section>
    </div>
  );
}
