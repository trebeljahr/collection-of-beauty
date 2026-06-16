import type { Metadata } from "next";
import Link from "next/link";
import { SubscribeForm } from "@/components/subscribe-form";
import { resolveEditionCover } from "@/lib/newsletter/cover";
import { loadUiVisibleEditions } from "@/lib/newsletter/editions";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Drops of Beauty - newsletter archive",
  description: `Drops of Beauty from ${SITE_NAME}: themed selections from the public-domain catalogue, with email signup and past editions.`,
  alternates: {
    canonical: "/drops",
    types: { "application/rss+xml": "/drops/rss.xml" },
  },
  openGraph: {
    title: `Drops of Beauty - ${SITE_NAME}`,
    description: "Themed editions from the public-domain catalogue.",
  },
};

export default function DropsPage() {
  const editions = loadUiVisibleEditions().slice().reverse();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <header className="mb-14 md:mb-20">
        <h1 className="font-serif text-3xl leading-tight tracking-tight md:text-5xl">
          Drops of Beauty
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
          Each Sunday edition picks five public-domain works around a single idea - a movement, a
          motif, a palette, a moment in time.
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
                      <div className="shrink-0 overflow-hidden rounded-md border border-[var(--border)] sm:w-48">
                        {/* biome-ignore lint/performance/noImgElement: Covers use prebuilt local variants, not Next image optimization. */}
                        <img
                          src={cover.url}
                          alt={cover.alt}
                          loading="lazy"
                          className="aspect-[4/3] w-full object-cover transition-opacity group-hover:opacity-90"
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
