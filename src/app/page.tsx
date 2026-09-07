import type { Metadata } from "next";
import Link from "next/link";
import { GalleryBrowser } from "@/components/gallery-browser";
import { ShuffleIcon } from "@/components/ui/shuffle-icon";
import { DEFAULT_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { summary } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
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
      <section className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          {/* The museum leads: it's the thing people link. */}
          <h1 className="font-serif text-3xl tracking-tight md:text-4xl">
            A walkable museum of public-domain art
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--muted-foreground)]">
            {ERAS.length} floors, one per era. {summary.totalArtworks.toLocaleString()} works by{" "}
            {summary.totalArtists.toLocaleString()} artists across {summary.totalMovements}{" "}
            movements, spanning {summary.yearRange.min}–{summary.yearRange.max}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 self-start md:self-auto">
          <Link
            href="/gallery-3d"
            className="inline-flex shrink-0 items-center rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            Enter the museum
          </Link>
          {/* No grid, no era, no artist to pick first. */}
          <Link
            href="/surprise"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium transition hover:bg-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <ShuffleIcon />
            Surprise me
          </Link>
        </div>
      </section>
      <h2 className="sr-only">Browse all works</h2>
      <GalleryBrowser
        initialArtworks={initialPage.items}
        eras={ERAS.map((e) => ({ id: e.id, title: e.title }))}
        totalArtworks={initialPage.total}
      />
    </div>
  );
}
