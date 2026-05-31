import type { Metadata } from "next";
import Link from "next/link";
import { ResponsiveImage } from "@/components/responsive-image";
import { resolveScope } from "@/lib/artwork-scope";
import type { ArtworkListing } from "@/lib/data";
import { ERAS, type Era } from "@/lib/gallery-eras";

export const metadata: Metadata = {
  title: "Eras",
  description:
    `Eight centuries of art grouped into ${ERAS.length} eras — ` +
    `Gothic to Modernism, with Ukiyo-e set apart. Each era is a room in the ` +
    `3D museum and a curated index of its works.`,
  alternates: { canonical: "/eras" },
  openGraph: {
    title: "Eras · Collection of Beauty",
    description:
      `Eight centuries of art grouped into ${ERAS.length} eras — ` +
      `Gothic to Modernism, with Ukiyo-e set apart.`,
  },
};

function yearRangeLabel(era: Era): string {
  if (era.yearMin > era.yearMax) return "Movement-tagged only";
  return `${era.yearMin}–${era.yearMax}`;
}

/** Pick a cover artwork for the era card. Prefers the first work that
 *  has pre-built variant widths so the responsive `<picture>` actually
 *  serves an AVIF; falls back to the first work overall (which will
 *  render the raw original via ResponsiveImage's no-variants path). */
function pickCover(works: ArtworkListing[]): ArtworkListing | null {
  return works.find((a) => a.variantWidths != null) ?? works[0] ?? null;
}

export default function ErasPage() {
  // Compute each era's resolved listing once at render time. Static
  // page; the cost is paid at build, not per-request.
  const cards = ERAS.map((era) => {
    const works = resolveScope({ kind: "era", id: era.id });
    return {
      era,
      cover: pickCover(works),
      count: works.length,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Eras</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Eight centuries of art grouped into the moments that shaped them. Each era is a floor in
          the 3D museum and a curated index here.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ era, cover, count }) => (
          <Link
            key={era.id}
            href={`/era/${era.id}`}
            className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <div
              className="relative aspect-[4/3] overflow-hidden"
              style={{ backgroundColor: era.palette.wallColor }}
            >
              {cover ? (
                <ResponsiveImage
                  objectKey={cover.objectKey}
                  variantWidths={cover.variantWidths}
                  alt={cover.title ? `${cover.title} — ${era.title}` : era.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  loading="lazy"
                  className="transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center font-serif text-lg"
                  style={{ color: era.palette.accent }}
                >
                  {era.title}
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-lg leading-tight">{era.title}</h2>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                  {yearRangeLabel(era)}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {count} work{count === 1 ? "" : "s"}
              </p>
              <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">{era.blurb}</p>
              {era.movements.length > 0 && (
                <p className="line-clamp-1 text-xs text-[var(--muted-foreground)]">
                  {era.movements.slice(0, 3).join(" · ")}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
