import type { Metadata } from "next";
import { artists } from "@/lib/data";
import { ArtistsBrowser } from "@/components/artists-browser";

export const metadata: Metadata = {
  title: "Artists",
  description:
    `${artists.length} artists represented in the Collection of Beauty, ` +
    `from Renaissance masters to 20th-century modernists to natural-history ` +
    `illustrators — browse by number of works, search, or filter by movement.`,
  alternates: { canonical: "/artists" },
  openGraph: {
    title: "Artists · Collection of Beauty",
    description: `${artists.length} artists represented, sorted by number of works.`,
  },
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
      <ArtistsBrowser artists={artists} />
    </div>
  );
}
