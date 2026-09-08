import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NewsletterEditionSubscribe } from "@/components/newsletter-edition-subscribe";
import { ResponsiveImage } from "@/components/responsive-image";
import { touchTextLinkClasses } from "@/components/ui/pill";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { artworks as ALL_ARTWORKS } from "@/lib/data";
import { resolveEditionCover } from "@/lib/newsletter/cover";
import { findEdition, loadUiVisibleEditions, showDraftsInUi } from "@/lib/newsletter/editions";
import { rehypeExternalLinks } from "@/lib/newsletter/markdown";
import type { Edition } from "@/lib/newsletter/types";
import { buildOpenGraph, SITE_NAME } from "@/lib/seo";

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
  const canonical = `/newsletter/${edition.fileSlug}`;
  return {
    title: edition.title,
    description: edition.excerpt,
    keywords: edition.tags.length > 0 ? edition.tags : undefined,
    alternates: { canonical },
    openGraph: buildOpenGraph({
      type: "article",
      // Same string as alternates.canonical, so og:url can't drift from it.
      url: canonical,
      title: `${edition.title} · ${SITE_NAME}`,
      description: edition.excerpt,
      publishedTime: edition.publishedAt,
      tags: edition.tags,
      // Spread conditionally: a literal `images: undefined` would override the
      // helper's site-wide default with nothing and drop og:image entirely.
      ...(ogImages ? { images: ogImages } : {}),
    }),
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
        {/* The one place that can't use touchTextLinkClasses verbatim. `w-fit` keeps
            the hit box hugging the words instead of spanning the nav row, so
            it can't swallow taps meant for the arrows beside it — and the
            `-my-3` half of the idiom is omitted because on a phone this is a
            `flex-col gap-4` item, where a negative block margin is subtracted
            from the margin box the gap measures against and would collapse
            the 16px between the two rows. The height still ends at `sm:`
            like everywhere else, so the desktop row is untouched. */}
        <Link
          href="/drops"
          className="inline-flex min-h-11 w-fit items-center rounded-sm underline underline-offset-2 hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0"
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
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeExternalLinks]}>
            {edition.body}
          </Markdown>
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
                alt={artworkAlt(artwork)}
                sizes="(max-width: 768px) 100vw, 768px"
                variantWidths={artwork.variantWidths}
                srcWidth={artwork.width ?? undefined}
                srcHeight={artwork.height ?? undefined}
                className="w-full h-auto"
              />
            </Link>
            <figcaption className="mt-3 md:mt-4">
              <h2 className="font-serif text-2xl md:text-3xl leading-tight">
                {/* Inline in an <h2>, the anchor box is only as tall as the
                    glyphs (~24–28px), so a one-word title was a small target
                    even though the heading line is taller. inline-flex gives
                    the anchor a box that min-h-11 can raise to 44px; it is
                    shrink-to-fit, so the text still wraps, and long titles
                    were already past the floor. No `-my-3` — the heading only
                    grows by ~14px here, not 24 — and both the box and the
                    floor end at `sm:`, where the 30px heading line plus a
                    mouse pointer (WCAG 2.5.8's 24px) need neither. */}
                <Link
                  href={`/artwork/${artwork.id}`}
                  className="inline-flex min-h-11 items-center underline underline-offset-4 hover:opacity-70 transition-opacity sm:inline sm:min-h-0"
                >
                  {displayTitle(artwork)}
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
                    rehypePlugins={[rehypeExternalLinks]}
                    components={{
                      p: ({ children }) => <p className="first:mt-0 mt-3">{children}</p>,
                      // py-1 on an *inline* anchor grows the hit box without
                      // touching the line box, so the note's rhythm is
                      // unchanged. These links sit inside running prose, which
                      // WCAG 2.5.8 exempts from the 44px floor precisely
                      // because the line height constrains them — a block
                      // target here would shove the sentence apart.
                      a: ({ href, children, target, rel }) => (
                        <a
                          href={href}
                          target={target}
                          rel={rel}
                          className="py-1 underline underline-offset-2 hover:opacity-70"
                        >
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
          <Link
            href="/drops"
            className={`${touchTextLinkClasses} underline-offset-2 hover:opacity-70`}
          >
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

/** `min-h-11 sm:min-h-9` on both the live link and its disabled twin.
 *  36px is the intended desktop size and it keeps it above `sm:` — WCAG
 *  2.5.5's 44px floor is a *touch* criterion, and a mouse pointer only
 *  asks for 2.5.8's 24px — but 36px is under that floor on a phone, where
 *  these two sit shoulder to shoulder in a `w-fit` row. Both boxes carry
 *  the identical pair of heights: gate only one and the arrows misalign
 *  at whichever width they disagree on, which is exactly the state at one
 *  edge of the archive, where one of them is the disabled twin. */
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
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[var(--muted-foreground)] opacity-45 sm:min-h-9"
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
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-3 transition-colors hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-9"
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
  const tolerateMissing = edition.draft && process.env.NODE_ENV !== "production";
  const resolved: { artwork: (typeof ALL_ARTWORKS)[number]; note: string | undefined }[] = [];
  for (const entry of edition.artworks) {
    const artwork = byId.get(entry.id);
    if (!artwork) {
      if (tolerateMissing) {
        console.warn(
          `[newsletter] draft ${edition.fileSlug}: artwork id "${entry.id}" not in catalogue — skipped.`,
        );
        continue;
      }
      throw new Error(`Edition ${edition.fileSlug}: artworks references unknown id "${entry.id}".`);
    }
    resolved.push({ artwork, note: entry.note });
  }
  return resolved;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
