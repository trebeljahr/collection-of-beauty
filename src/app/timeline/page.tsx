import type { Metadata } from "next";
import { TimelineView } from "@/components/timeline-view";
import { artworks, movements, summary } from "@/lib/data";

export const metadata: Metadata = {
  title: "Timeline",
  description:
    `A chronological view of ${summary.totalArtworks.toLocaleString()} works, ` +
    `grouped by decade from ${summary.yearRange.min} to ${summary.yearRange.max}. ` +
    `Hover any column to see the count; click to jump to that period.`,
  alternates: { canonical: "/timeline" },
  openGraph: {
    title: "Timeline · Collection of Beauty",
    description:
      `${summary.totalArtworks.toLocaleString()} works grouped by decade, ` +
      `from ${summary.yearRange.min} to ${summary.yearRange.max}.`,
  },
};

export default function TimelinePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl">Timeline</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Works grouped by decade. Hover a column to see the count; click to
          jump there.
        </p>
      </header>
      <TimelineView artworks={artworks} movements={movements} />
    </div>
  );
}
