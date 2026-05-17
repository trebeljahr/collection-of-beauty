import type { Metadata } from "next";
import Link from "next/link";
import { resolveEditionCover } from "@/lib/newsletter/cover";
import { loadPublishedEditions } from "@/lib/newsletter/editions";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Newsletter archive",
  description: `Past editions of the ${SITE_NAME} newsletter — themed selections from the public-domain catalogue.`,
  alternates: {
    canonical: "/newsletter",
    types: { "application/rss+xml": "/newsletter/rss.xml" },
  },
  openGraph: {
    title: `Newsletter · ${SITE_NAME}`,
    description: "Themed editions from the public-domain catalogue.",
  },
};

export default function NewsletterIndexPage() {
  const editions = loadPublishedEditions().slice().reverse();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <header className="mb-10">
        <h1 className="font-serif text-3xl md:text-4xl">Newsletter</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Themed selections from the {SITE_NAME} catalogue. Each edition picks five public-domain
          works around a single idea — a movement, a motif, a palette, a moment in time.
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/sub" className="underline underline-offset-2 hover:opacity-70">
            Subscribe by email →
          </Link>
          <Link
            href="/newsletter/rss.xml"
            className="underline underline-offset-2 hover:opacity-70"
            // RSS isn't an internal route; <a> is intentional so middleware
            // doesn't intercept and the browser hands it to a reader app.
          >
            RSS
          </Link>
        </p>
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
              <li key={ed.fileSlug} className="py-6">
                <Link
                  href={`/newsletter/${ed.fileSlug}`}
                  className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {cover && (
                      <div className="shrink-0 overflow-hidden rounded-md border border-[var(--border)] sm:w-40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                        <span>Issue {String(ed.number).padStart(4, "0")}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={ed.publishedAt}>{formatDate(ed.publishedAt)}</time>
                        {ed.readingTimeMinutes > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{ed.readingTimeMinutes} min read</span>
                          </>
                        )}
                      </div>
                      <h2 className="mt-2 font-serif text-2xl transition-opacity group-hover:opacity-70">
                        {ed.title}
                      </h2>
                      <p className="mt-2 text-[var(--muted-foreground)] leading-relaxed">
                        {ed.excerpt}
                      </p>
                      {ed.tags.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
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
