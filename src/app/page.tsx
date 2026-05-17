import type { Metadata } from "next";
import { GalleryBrowser } from "@/components/gallery-browser";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { movements, summary } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const metadata: Metadata = {
  // Absolute title on the home page — skips the "%s · Collection of Beauty"
  // template so the tagline gets first-class billing in tab chrome and search.
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const initialPage = getArtworkListingPage({ limit: DEFAULT_ARTWORK_PAGE_SIZE });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <section className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight md:text-4xl">
            A personal gallery of beauty
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            {summary.totalArtworks.toLocaleString()} works by{" "}
            {summary.totalArtists.toLocaleString()} artists across {summary.totalMovements}{" "}
            movements, spanning {summary.yearRange.min}–{summary.yearRange.max}.
          </p>
        </div>
      </section>
      <h2 className="sr-only">Browse all works</h2>
      <GalleryBrowser
        initialArtworks={initialPage.items}
        movements={movements}
        totalArtworks={initialPage.total}
      />
    </div>
  );
}
