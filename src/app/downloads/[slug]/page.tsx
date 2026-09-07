// One published plate set: prose, the archive link, and the full plate
// list as crawlable text.
//
// The plate list matters for the same reason the hub page exists — someone
// searching "audubon wild turkey plate 1 download" should land on a page
// that names the plate and links straight to its download panel, not on a
// generic "browse the collection" shell.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResponsiveImage } from "@/components/responsive-image";
import {
  COLLECTIONS,
  collectionArtworks,
  collectionZipEntries,
  getCollection,
  isCollectionCapped,
  ZIP_MAX_ENTRIES,
  ZIP_VARIANT_WIDTH,
} from "@/lib/collections";
import { artworkAlt, displayTitle } from "@/lib/data";
import { largestDownload } from "@/lib/downloads";
import { absoluteUrl, buildOpenGraph, jsonLdScriptProps, SITE_NAME } from "@/lib/seo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) return { title: "Collection not found" };

  const count = collectionArtworks(collection).length;
  const title = `${collection.title} — download all ${count} plates`;
  const description = `Free high-resolution downloads of all ${count} plates from ${collection.creator}'s ${collection.title} (${collection.published}). Public domain, no account, no attribution required. Individual plates up to full scan resolution, or the complete set as one ZIP.`;

  return {
    title,
    description,
    alternates: { canonical: `/downloads/${collection.slug}` },
    openGraph: buildOpenGraph({
      url: `/downloads/${collection.slug}`,
      title: `${title} · ${SITE_NAME}`,
      description,
    }),
    robots: { index: true, follow: true },
  };
}

export default async function CollectionDownloadPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) notFound();

  const plates = collectionArtworks(collection);
  const included = collectionZipEntries(collection).length;
  const capped = isCollectionCapped(collection);
  const cover = plates[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <script {...jsonLdScriptProps(collectionJsonLd(collection.slug, plates.length))} />

      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        <Link href="/downloads" className="underline underline-offset-4">
          ← All downloads
        </Link>
      </p>

      <h1 className="font-serif text-3xl md:text-4xl">
        {collection.title} — download all {plates.length} plates
      </h1>
      <p className="mt-2 text-lg text-[var(--muted-foreground)]">
        {collection.creator} · {collection.published}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-start">
        {cover && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-2">
            <ResponsiveImage
              objectKey={cover.objectKey}
              variantWidths={cover.variantWidths}
              alt={artworkAlt(cover)}
              srcWidth={cover.width ?? undefined}
              srcHeight={cover.height ?? undefined}
              dominantColor={cover.dominantColor}
              sizes="(max-width: 768px) 100vw, 40vw"
              className="h-auto w-full rounded"
            />
          </div>
        )}

        <div className="space-y-4">
          <p className="leading-relaxed">{collection.blurb}</p>

          <a
            href={`/api/collections/${collection.slug}`}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Download all {included} plates (.zip)
          </a>

          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            {included} AVIF files at {ZIP_VARIANT_WIDTH.toLocaleString("en-US")} px wide, plus a{" "}
            <code>README.txt</code> with a credit line and a link for every plate. The archive is
            built when you ask for it and streamed as it&rsquo;s built, so there&rsquo;s no progress
            bar — the download starts immediately and finishes when the last plate lands.
          </p>

          {capped && (
            <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
              This set is capped at {ZIP_MAX_ENTRIES} plates per archive. The remaining{" "}
              {plates.length - ZIP_MAX_ENTRIES} are listed below and download individually.
            </p>
          )}

          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            {collection.sourceNote} Public domain — no permission needed, no attribution required.
            For a single plate at its full scan resolution, open it below and use its own download
            panel.
          </p>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="font-serif text-2xl">All {plates.length} plates</h2>
        <ol className="mt-4 space-y-1 text-sm">
          {plates.map((art, i) => {
            const option = largestDownload(art);
            return (
              <li key={art.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {String(i + 1).padStart(3, "0")}
                </span>
                <Link href={`/artwork/${art.id}#download`} className="underline underline-offset-4">
                  {displayTitle(art)}
                </Link>
                {option && (
                  <span className="text-xs text-[var(--muted-foreground)]">{option.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function collectionJsonLd(slug: string, count: number): Record<string, unknown> {
  const collection = getCollection(slug);
  if (!collection) return {};
  return {
    "@context": "https://schema.org",
    "@type": "DataDownload",
    name: `${collection.title} — ${collection.creator}`,
    description: collection.blurb,
    creator: { "@type": "Person", name: collection.creator },
    encodingFormat: "application/zip",
    contentUrl: absoluteUrl(`/api/collections/${collection.slug}`),
    url: absoluteUrl(`/downloads/${collection.slug}`),
    license: "https://creativecommons.org/publicdomain/mark/1.0/",
    isAccessibleForFree: true,
    measurementTechnique: `${count} plates at ${ZIP_VARIANT_WIDTH} px`,
  };
}
