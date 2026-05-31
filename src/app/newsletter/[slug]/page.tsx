import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NewsletterEditionSubscribe } from "@/components/newsletter-edition-subscribe";
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
  const editions = loadUiVisibleEditions();
  const edition = editions.find((e) => e.fileSlug === slug || e.themeSlug === slug);
  if (!edition) notFound();

  const index = editions.findIndex((e) => e.fileSlug === edition.fileSlug);
  const previousEdition = index > 0 ? editions[index - 1] : null;
  const nextEdition = index >= 0 && index < editions.length - 1 ? editions[index + 1] : null;
  const resolved = resolveArtworks(edition);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <nav
        aria-label="Edition navigation"
        className="mb-8 flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <Link
          href="/drops"
          className="w-fit rounded-sm underline underline-offset-2 hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          ← All editions
        </Link>
        <EditionArrowControls previousEdition={previousEdition} nextEdition={nextEdition} />
      </nav>

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
                  className="underline underline-offset-4 decoration-[var(--border)] hover:opacity-70 transition-opacity"
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
                <div className="mt-5 text-[var(--foreground)] leading-[1.75] text-[1.0625rem]">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="first:mt-0 mt-3">{children}</p>,
                      a: ({ href, children }) => (
                        <a href={href} className="underline underline-offset-2 hover:opacity-70">
                          {children}
                        </a>
                      ),
                      em: ({ children }) => <em className="italic">{children}</em>,
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                    }}
                  >
                    {note}
                  </Markdown>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </section>

      <footer className="mt-20 md:mt-24 border-t border-[var(--border)] pt-8">
        <nav aria-label="Adjacent editions" className="grid gap-4 text-sm sm:grid-cols-2">
          <EditionFooterLink edition={previousEdition} direction="previous" />
          <EditionFooterLink edition={nextEdition} direction="next" />
        </nav>
        <div className="mt-8 text-sm">
          <Link href="/drops" className="underline underline-offset-2 hover:opacity-70">
            ← All editions
          </Link>
        </div>
        <NewsletterEditionSubscribe />
      </footer>
    </article>
  );
}

type EditionNeighbor = Pick<Edition, "fileSlug" | "number" | "title"> | null;

function EditionArrowControls({
  previousEdition,
  nextEdition,
}: {
  previousEdition: EditionNeighbor;
  nextEdition: EditionNeighbor;
}) {
  return (
    <div className="flex w-fit items-center gap-2">
      <EditionArrowLink edition={previousEdition} direction="previous" />
      <EditionArrowLink edition={nextEdition} direction="next" />
    </div>
  );
}

function EditionArrowLink({
  edition,
  direction,
}: {
  edition: EditionNeighbor;
  direction: "previous" | "next";
}) {
  const label = direction === "previous" ? "Previous" : "Next";
  const icon =
    direction === "previous" ? (
      <ArrowLeft aria-hidden="true" className="size-4" />
    ) : (
      <ArrowRight aria-hidden="true" className="size-4" />
    );

  if (!edition) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[var(--muted-foreground)] opacity-45"
      >
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </span>
    );
  }

  return (
    <Link
      href={`/newsletter/${edition.fileSlug}`}
      title={`Issue ${edition.number}: ${edition.title}`}
      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 transition-colors hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {direction === "previous" ? icon : null}
      {label}
      {direction === "next" ? icon : null}
    </Link>
  );
}

function EditionFooterLink({
  edition,
  direction,
}: {
  edition: EditionNeighbor;
  direction: "previous" | "next";
}) {
  const isPrevious = direction === "previous";
  const label = isPrevious ? "Previous edition" : "Next edition";

  if (!edition) {
    return (
      <span
        aria-disabled="true"
        className={`rounded-md border border-[var(--border)] px-4 py-3 text-[var(--muted-foreground)] opacity-45 ${
          isPrevious ? "" : "sm:text-right"
        }`}
      >
        <span className="block text-xs uppercase tracking-[0.18em]">{label}</span>
        <span className="mt-1 block">No {isPrevious ? "earlier" : "newer"} edition</span>
      </span>
    );
  }

  return (
    <Link
      href={`/newsletter/${edition.fileSlug}`}
      className={`group rounded-md border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
        isPrevious ? "" : "sm:text-right"
      }`}
    >
      <span
        className={`flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] ${
          isPrevious ? "" : "sm:justify-end"
        }`}
      >
        {isPrevious ? <ArrowLeft aria-hidden="true" className="size-3.5" /> : null}
        {label}
        {!isPrevious ? <ArrowRight aria-hidden="true" className="size-3.5" /> : null}
      </span>
      <span className="mt-2 block font-serif text-xl leading-tight transition-opacity group-hover:opacity-70">
        Issue {edition.number}: {edition.title}
      </span>
    </Link>
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
