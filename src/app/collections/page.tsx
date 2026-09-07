import type { Metadata } from "next";
import Link from "next/link";
import { ResponsiveImage } from "@/components/responsive-image";
import { getPlateSets, holdingSentence } from "@/lib/plate-sets";
import { buildOpenGraph, collectionsIndexJsonLd, jsonLdScriptProps } from "@/lib/seo";

// Rendered entirely from the bundled artwork JSON — nothing here reads a
// request, so match the sitemap's daily window instead of re-rendering.
export const revalidate = 86400;

const sets = getPlateSets();
const totalPlates = sets.reduce((n, set) => n + set.presentCount, 0);

const DESCRIPTION =
  `Four illustrated books held as complete or near-complete plate runs — ` +
  `${totalPlates.toLocaleString()} plates in all. Audubon's Birds of America, ` +
  `Haeckel's Kunstformen der Natur, and Redouté's Les Roses and Les Liliacées, ` +
  `each in published plate order.`;

export const metadata: Metadata = {
  title: "Complete plate sets",
  description: DESCRIPTION,
  alternates: { canonical: "/collections" },
  // Same path as alternates.canonical above — buildOpenGraph resolves it to
  // an absolute og:url so the two can't drift apart.
  openGraph: buildOpenGraph({
    url: "/collections",
    title: "Complete plate sets · Collection of Beauty",
    description: DESCRIPTION,
  }),
};

export default function CollectionsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <script
        {...jsonLdScriptProps(
          collectionsIndexJsonLd(
            sets.map((set) => ({ id: set.id, title: set.title, tagline: set.tagline })),
          ),
        )}
      />

      <header className="mb-8 max-w-prose">
        <h1 className="font-serif text-3xl md:text-4xl">Complete plate sets</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Four illustrated books held as complete runs and shown in published plate order,{" "}
          {totalPlates.toLocaleString()} plates between them. Where a run falls short, the page says
          so and lists the missing plate numbers.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {sets.map((set) => {
          const cover = set.plates.find((p) => p.listing.variantWidths != null)?.listing;
          return (
            <Link
              key={set.id}
              href={`/collection/${set.id}`}
              className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--muted)]">
                {cover && (
                  <ResponsiveImage
                    objectKey={cover.objectKey}
                    variantWidths={cover.variantWidths}
                    alt={`${set.title} — ${set.author}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    loading="lazy"
                    className="transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </div>
              <div className="space-y-2 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-serif text-xl leading-tight">{set.title}</h2>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                    {set.publishedLabel}
                  </span>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">{set.author}</p>
                <p className="text-sm">{set.tagline}</p>
                <p className="text-xs text-[var(--muted-foreground)]">{holdingSentence(set)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
