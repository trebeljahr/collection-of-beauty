import { artists } from "@/lib/data";
import { ArtistsBrowser } from "@/components/artists-browser";

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
