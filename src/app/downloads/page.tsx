// The crawlable download hub.
//
// Server-rendered prose and plain anchors, no JS-only buttons, so the
// sizes, the licence terms and the per-set links are all in the HTML a
// crawler receives.

import type { Metadata } from "next";
import Link from "next/link";
import {
  COLLECTIONS,
  collectionArtworks,
  collectionZipEntries,
  isCollectionCapped,
  ZIP_MAX_ENTRIES,
  ZIP_VARIANT_WIDTH,
} from "@/lib/collections";
import { artworkListings, artworks, displayTitle, summary } from "@/lib/data";
import { LADDER_MAX_WIDTH, largestDownload } from "@/lib/downloads";
import { absoluteUrl, buildOpenGraph, jsonLdScriptProps, SITE_NAME } from "@/lib/seo";

const TITLE = "Download public-domain art in high resolution";
const DESCRIPTION =
  "Free high-resolution downloads of public-domain paintings, botanical plates and natural-history illustrations. Per-artwork files up to 16,384 px, plus complete ZIP archives of Audubon's Birds of America, Redouté's Les Roses and Les Liliacées, and Haeckel's Kunstformen der Natur.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/downloads" },
  openGraph: buildOpenGraph({
    url: "/downloads",
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
  }),
  robots: { index: true, follow: true },
};

/** Works whose source scan exceeded the 4,096 px ladder and so carry a
 *  per-source full-size encode. This is the number the download queries
 *  are actually asking about. */
const fullSizeCount = artworkListings.filter((a) =>
  a.variantWidths?.some((w) => w > LADDER_MAX_WIDTH),
).length;

/** The widest works in the catalogue. Real titles with real pixel counts
 *  rank for the long tail; a "browse the collection" link doesn't. */
const widest = artworks
  .map((a) => ({ art: a, option: largestDownload(a) }))
  .filter((x): x is { art: (typeof artworks)[number]; option: NonNullable<typeof x.option> } =>
    Boolean(x.option?.isFullSize),
  )
  .sort((a, b) => b.option.width - a.option.width)
  .slice(0, 12);

export default function DownloadsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <script {...jsonLdScriptProps(downloadsJsonLd())} />

      <h1 className="font-serif text-3xl md:text-4xl">{TITLE}</h1>

      <dl className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-[var(--muted-foreground)]">Works</dt>
        <dd>{summary.totalArtworks.toLocaleString("en-US")}, free, no account, no attribution</dd>
        <dt className="text-[var(--muted-foreground)]">Format</dt>
        <dd>AVIF, quality 60. 1,280 px WebP alongside where it exists.</dd>
        <dt className="text-[var(--muted-foreground)]">Widths</dt>
        <dd>256, 480, 640, 960, 1280, 1920, 2560, 4096 px</dd>
        <dt className="text-[var(--muted-foreground)]">Full size</dt>
        <dd>
          {fullSizeCount.toLocaleString("en-US")} works scanned above{" "}
          {LADDER_MAX_WIDTH.toLocaleString("en-US")} px, up to 16,384 px on the long side
        </dd>
      </dl>

      <section id="collections" className="mt-12 space-y-4">
        <h2 className="font-serif text-2xl">Complete collections</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Plates inside each archive are {ZIP_VARIANT_WIDTH.toLocaleString("en-US")} px AVIF.
        </p>

        <ul className="space-y-4">
          {COLLECTIONS.map((collection) => {
            const total = collectionArtworks(collection).length;
            const included = collectionZipEntries(collection).length;
            return (
              <li key={collection.slug} className="rounded-lg border border-[var(--border)] p-4">
                <h3 className="font-serif text-xl">
                  <Link
                    href={`/downloads/${collection.slug}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {collection.title}
                  </Link>
                </h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {collection.creator} · {collection.published} · {total} plates
                </p>
                <p className="mt-2 text-sm leading-relaxed">{collection.blurb}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <a
                    href={`/api/collections/${collection.slug}`}
                    className="underline underline-offset-4"
                  >
                    Download all {included} plates (.zip)
                  </a>
                  <Link
                    href={`/downloads/${collection.slug}`}
                    className="text-[var(--muted-foreground)] underline underline-offset-4"
                  >
                    Browse the plates
                  </Link>
                </p>
                {isCollectionCapped(collection) && (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    Capped at {ZIP_MAX_ENTRIES} plates per archive; the remaining{" "}
                    {total - ZIP_MAX_ENTRIES} are downloadable individually.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section id="largest" className="mt-12 space-y-3">
        <h2 className="font-serif text-2xl">Largest scans</h2>
        <ul className="space-y-2">
          {widest.map(({ art, option }) => (
            <li key={art.id} className="text-sm">
              <Link href={`/artwork/${art.id}#download`} className="underline underline-offset-4">
                {displayTitle(art)}
              </Link>
              {art.artist && (
                <span className="text-[var(--muted-foreground)]"> — {art.artist}</span>
              )}
              <span className="text-[var(--muted-foreground)]"> · {option.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="licence" className="mt-12 space-y-3">
        <h2 className="font-serif text-2xl">Licence</h2>
        <p className="text-sm leading-relaxed">
          Public domain: no attribution required. A small number of works carry a Creative Commons
          licence instead — each artwork page states which and links the licence text. Credit lines
          are on every artwork page, and in a <code>README.txt</code> inside every archive.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl">Browse</h2>
        <p className="mt-2 text-sm">
          <Link href="/artists" className="underline underline-offset-4">
            By artist
          </Link>
          {" · "}
          <Link href="/eras" className="underline underline-offset-4">
            By era
          </Link>
          {" · "}
          <Link href="/timeline" className="underline underline-offset-4">
            Timeline
          </Link>
        </p>
      </section>
    </div>
  );
}

function downloadsJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/downloads"),
    isAccessibleForFree: true,
    hasPart: COLLECTIONS.map((c) => ({
      "@type": "DataDownload",
      name: `${c.title} — ${c.creator}`,
      description: c.blurb,
      encodingFormat: "application/zip",
      contentUrl: absoluteUrl(`/api/collections/${c.slug}`),
      url: absoluteUrl(`/downloads/${c.slug}`),
      license: "https://creativecommons.org/publicdomain/mark/1.0/",
    })),
  };
}
