import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ResponsiveImage } from "@/components/responsive-image";
import { artworks as ALL_ARTWORKS } from "@/lib/data";
import { resolveEditionCover } from "@/lib/newsletter/cover";
import { findEdition, loadUiVisibleEditions, showDraftsInUi } from "@/lib/newsletter/editions";
import type { Edition } from "@/lib/newsletter/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return loadUiVisibleEditions().map((e) => ({ slug: e.fileSlug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const edition = findEdition(slug);
  if (!edition) return {};
  if (edition.draft && !showDraftsInUi()) return {};
  const cover = resolveEditionCover(edition);
  const ogImages = cover
    ? [{ url: cover.url, alt: cover.alt, width: 1280, height: 960 }]
    : undefined;
  return {
    title: edition.title,
    description: edition.excerpt,
    keywords: edition.tags.length > 0 ? edition.tags : undefined,
    alternates: { canonical: `/newsletter/${edition.fileSlug}` },
    openGraph: {
      type: "article",
      title: `${edition.title} · ${SITE_NAME}`,
      description: edition.excerpt,
      url: `${SITE_URL}/newsletter/${edition.fileSlug}`,
      publishedTime: edition.publishedAt,
      tags: edition.tags,
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: `${edition.title} · ${SITE_NAME}`,
      description: edition.excerpt,
      images: ogImages?.map((img) => img.url),
    },
  };
}

export default async function EditionPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const edition = findEdition(slug);
  if (!edition) notFound();
  if (edition.draft && !showDraftsInUi()) notFound();

  const resolved = resolveArtworks(edition);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <header className="mb-10 md:mb-14">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          <span>Issue {edition.number}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={edition.publishedAt}>{formatDate(edition.publishedAt)}</time>
          {edition.readingTimeMinutes > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{edition.readingTimeMinutes} min read</span>
            </>
          )}
          {edition.draft && (
            <span className="rounded border border-amber-500 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
              Draft
            </span>
          )}
        </div>
        <h1 className="mt-5 font-serif text-3xl md:text-5xl tracking-tight leading-tight">
          {edition.title}
        </h1>
        {edition.tags.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            {edition.tags.map((t) => (
              <li key={t} className="rounded border border-[var(--border)] px-1.5 py-0.5">
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      {edition.body.length > 0 && (
        <section className="prose-newsletter mb-10 md:mb-12 text-[var(--foreground)]">
          <Markdown remarkPlugins={[remarkGfm]}>{edition.body}</Markdown>
        </section>
      )}

      <section className="flex flex-col gap-7 md:gap-10">
        {resolved.map(({ artwork, note }) => (
          <figure key={artwork.id} className="m-0">
            <Link
              href={`/artwork/${artwork.id}`}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md overflow-hidden"
            >
              <ResponsiveImage
                objectKey={artwork.objectKey}
                alt={artwork.title}
                sizes="(max-width: 768px) 100vw, 768px"
                variantWidths={artwork.variantWidths}
                srcWidth={artwork.width ?? undefined}
                srcHeight={artwork.height ?? undefined}
                className="w-full h-auto"
              />
            </Link>
            <figcaption className="mt-3 md:mt-4">
              <h2 className="font-serif text-2xl md:text-3xl leading-tight">
                <Link
                  href={`/artwork/${artwork.id}`}
                  className="hover:opacity-70 transition-opacity"
                >
                  {artwork.title}
                </Link>
              </h2>
              <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
                {artwork.artist ?? "Unknown artist"}
                {artwork.year ? ` · ${artwork.year}` : ""}
                {artwork.movement ? ` · ${artwork.movement}` : ""}
                {artwork.realDimensions
                  ? ` · ${artwork.realDimensions.widthCm.toFixed(0)} × ${artwork.realDimensions.heightCm.toFixed(0)} cm`
                  : ""}
              </p>
              {note && (
                <p className="mt-5 text-[var(--foreground)] leading-[1.75] text-[1.0625rem]">
                  {note}
                </p>
              )}
            </figcaption>
          </figure>
        ))}
      </section>

      <footer className="mt-20 md:mt-24 border-t border-[var(--border)] pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
        <Link href="/drops" className="underline underline-offset-2 hover:opacity-70">
          ← All editions
        </Link>
        <Link href="/sub" className="underline underline-offset-2 hover:opacity-70">
          Subscribe to new editions →
        </Link>
      </footer>
    </article>
  );
}

function resolveArtworks(edition: Edition) {
  const byId = new Map(ALL_ARTWORKS.map((a) => [a.id, a]));
  return edition.artworks.map((entry) => {
    const artwork = byId.get(entry.id);
    if (!artwork) {
      throw new Error(`Edition ${edition.fileSlug}: artworks references unknown id "${entry.id}".`);
    }
    return { artwork, note: entry.note };
  });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
