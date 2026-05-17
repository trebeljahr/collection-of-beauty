import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ResponsiveImage } from "@/components/responsive-image";
import { artworks as ALL_ARTWORKS } from "@/lib/data";
import { findEdition, loadPublishedEditions } from "@/lib/newsletter/editions";
import type { Edition } from "@/lib/newsletter/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return loadPublishedEditions().map((e) => ({ slug: e.fileSlug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const edition = findEdition(slug);
  if (!edition || edition.draft) return {};
  return {
    title: edition.title,
    description: edition.excerpt,
    alternates: { canonical: `/newsletter/${edition.fileSlug}` },
    openGraph: {
      type: "article",
      title: `${edition.title} · ${SITE_NAME}`,
      description: edition.excerpt,
      url: `${SITE_URL}/newsletter/${edition.fileSlug}`,
      publishedTime: edition.publishedAt,
    },
  };
}

export default async function EditionPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const edition = findEdition(slug);
  if (!edition || edition.draft) notFound();

  const resolved = resolveArtworks(edition);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <header className="mb-10">
        <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          <span>Issue {String(edition.number).padStart(4, "0")}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={edition.publishedAt}>{formatDate(edition.publishedAt)}</time>
        </div>
        <h1 className="mt-3 font-serif text-3xl md:text-5xl tracking-tight">{edition.title}</h1>
      </header>

      {edition.body.length > 0 && (
        <section className="prose-newsletter mb-12 text-[var(--foreground)] leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{edition.body}</Markdown>
        </section>
      )}

      <section className="space-y-16">
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
            <figcaption className="mt-4">
              <h2 className="font-serif text-2xl">
                <Link
                  href={`/artwork/${artwork.id}`}
                  className="hover:opacity-70 transition-opacity"
                >
                  {artwork.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {artwork.artist ?? "Unknown artist"}
                {artwork.year ? ` · ${artwork.year}` : ""}
                {artwork.movement ? ` · ${artwork.movement}` : ""}
              </p>
              {note && <p className="mt-3 text-[var(--foreground)] leading-relaxed">{note}</p>}
            </figcaption>
          </figure>
        ))}
      </section>

      <footer className="mt-16 border-t border-[var(--border)] pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
        <Link href="/newsletter" className="underline underline-offset-2 hover:opacity-70">
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
