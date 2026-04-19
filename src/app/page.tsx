import { GalleryBrowser } from "@/components/gallery-browser";
import { artworks, movements, summary } from "@/lib/data";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <section className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight md:text-4xl">
            A personal gallery of beauty
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            {summary.totalArtworks.toLocaleString()} works by{" "}
            {summary.totalArtists.toLocaleString()} artists across{" "}
            {summary.totalMovements} movements, spanning{" "}
            {summary.yearRange.min}–{summary.yearRange.max}.
          </p>
        </div>
      </section>
      <GalleryBrowser artworks={artworks} movements={movements} />
    </div>
  );
}
