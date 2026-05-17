import type { Metadata } from "next";
import Link from "next/link";
import { loadPublishedEditions } from "@/lib/newsletter/editions";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Newsletter archive",
  description: `Past editions of the ${SITE_NAME} newsletter — themed selections from the public-domain catalogue.`,
  alternates: { canonical: "/newsletter" },
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
        <p className="mt-4 text-sm">
          <Link href="/sub" className="underline underline-offset-2 hover:opacity-70">
            Subscribe to get new editions by email →
          </Link>
        </p>
      </header>

      {editions.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No editions published yet. Check back soon.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {editions.map((ed) => (
            <li key={ed.fileSlug} className="py-6">
              <Link
                href={`/newsletter/${ed.fileSlug}`}
                className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md"
              >
                <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  <span>Issue {String(ed.number).padStart(4, "0")}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={ed.publishedAt}>{formatDate(ed.publishedAt)}</time>
                </div>
                <h2 className="mt-2 font-serif text-2xl group-hover:opacity-70 transition-opacity">
                  {ed.title}
                </h2>
                <p className="mt-2 text-[var(--muted-foreground)] leading-relaxed">{ed.excerpt}</p>
              </Link>
            </li>
          ))}
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
