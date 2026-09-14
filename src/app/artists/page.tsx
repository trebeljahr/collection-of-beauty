import type { Metadata } from "next";
import { ArtistsBrowser } from "@/components/artists-browser";
import { artists } from "@/lib/data";
import { buildOpenGraph } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Artists",
  description:
    `${artists.length} artists represented in the Collection of Beauty, ` +
    `spanning painters, printmakers and natural-history illustrators. ` +
    `Sorted by number of works, and searchable by name, movement or nationality.`,
  alternates: { canonical: "/artists" },
  openGraph: buildOpenGraph({
    url: "/artists",
    title: "Artists · Collection of Beauty",
    description: `${artists.length} artists represented, sorted by number of works.`,
  }),
};

export default function ArtistsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Artists</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          {artists.length} artists represented, sorted by number of works.
        </p>
      </header>
      <h2 className="sr-only">All artists</h2>
      <ArtistsBrowser artists={artists} />
    </div>
  );
}
