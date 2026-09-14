import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SubscribeForm } from "@/components/subscribe-form";
import { resolveEditionCover } from "@/lib/newsletter/cover";
import { loadUiVisibleEditions } from "@/lib/newsletter/editions";
import { buildOpenGraph, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Drops of Beauty - newsletter archive",
  description: `Drops of Beauty from ${SITE_NAME}: themed selections from the public-domain catalogue, with email signup and past editions.`,
  alternates: {
    canonical: "/drops",
    types: { "application/rss+xml": "/rss.xml" },
  },
  openGraph: buildOpenGraph({
    url: "/drops",
    title: `Drops of Beauty - ${SITE_NAME}`,
    description: "Themed editions from the public-domain catalogue.",
  }),
};

// Card shape limits, width over height. Inside a range the box takes the
// cover's own proportions, so most covers show whole; outside it (a 0.47
// hanging scroll, a 2.2 folding screen) the box stops at the limit and
// the cover crops around its `cover.focus`. A fixed 4:3 box cut the
// courtesan scroll to a third of its height. Full-width phone cards stop
// at square so a tall cover doesn't fill the screen; the 12rem column
// beside the text from `sm` up can go taller and stops wide covers from
// shrinking to a strip.
const COVER_LIMITS = {
  phone: { min: 1, max: 16 / 9 },
  column: { min: 4 / 5, max: 3 / 2 },
};

function clampAspect(aspectRatio: number | null, limits: { min: number; max: number }): number {
  if (aspectRatio == null) return 4 / 3;
  return Math.min(limits.max, Math.max(limits.min, aspectRatio));
}

export default function DropsPage() {
  const editions = loadUiVisibleEditions().slice().reverse();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <header className="mb-14 md:mb-20">
        <h1 className="font-serif text-3xl leading-tight tracking-tight md:text-5xl">
          Drops of Beauty
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
          Each edition picks five public-domain works around one idea: a motif, a movement, an hour
          of the day. Every work gets a short note on what to look at and one thing worth knowing
          about it, and the edition closes with a few lines on what the five have in common.
        </p>

        <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6">
          <SubscribeForm />
        </div>
      </header>

      {editions.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No editions published yet. Check back soon.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {editions.map((ed) => {
            const cover = resolveEditionCover(ed);
            return (
              <li key={ed.fileSlug} className="py-10 md:py-12">
                <Link
                  href={`/newsletter/${ed.fileSlug}`}
                  className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                    {cover && (
                      // `sm:self-start`: in the row layout a flex item stretches to the
                      // text column's height, which left the frame taller than the
                      // cover and blank below it.
                      <div className="shrink-0 overflow-hidden rounded-md border border-[var(--border)] sm:w-48 sm:self-start">
                        {/* biome-ignore lint/performance/noImgElement: Covers use prebuilt local variants, not Next image optimization. */}
                        <img
                          src={cover.url}
                          alt={cover.alt}
                          loading="lazy"
                          className="block aspect-(--cover-aspect) w-full object-cover transition-opacity group-hover:opacity-90 sm:aspect-(--cover-aspect-sm)"
                          style={
                            {
                              "--cover-aspect": clampAspect(cover.aspectRatio, COVER_LIMITS.phone),
                              "--cover-aspect-sm": clampAspect(
                                cover.aspectRatio,
                                COVER_LIMITS.column,
                              ),
                              objectPosition: cover.objectPosition,
                            } as CSSProperties
                          }
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        <span>Issue {ed.number}</span>
                        <span aria-hidden="true">-</span>
                        <time dateTime={ed.publishedAt}>{formatDate(ed.publishedAt)}</time>
                        {ed.readingTimeMinutes > 0 && (
                          <>
                            <span aria-hidden="true">-</span>
                            <span>{ed.readingTimeMinutes} min read</span>
                          </>
                        )}
                        {ed.draft && (
                          <span className="rounded border border-amber-500 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                            Draft
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 font-serif text-2xl leading-tight transition-opacity group-hover:opacity-70 md:text-3xl">
                        {ed.title}
                      </h2>
                      <p className="mt-4 leading-relaxed text-[var(--muted-foreground)]">
                        {ed.excerpt}
                      </p>
                      {ed.tags.length > 0 && (
                        <ul className="mt-5 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                          {ed.tags.map((t) => (
                            <li
                              key={t}
                              className="rounded border border-[var(--border)] px-1.5 py-0.5"
                            >
                              {t}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
