// The crawlable download hub.
//
// This page exists because "public domain <artist> high resolution
// download" is a real query with real volume and the site used to answer
// it with nothing — /press even admitted a bulk release was "on the
// post-launch list". Everything here is server-rendered prose and plain
// anchors: no JS-only buttons, so the sizes, the licence terms and the
// per-set links are all in the HTML a crawler receives.

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

/** The widest works in the catalogue, as a concrete entry point — a list
 *  of real titles with real pixel counts ranks for the long tail in a way
 *  that a bare "browse the collection" link never does. */
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

      <p className="mt-4 text-lg leading-relaxed text-[var(--muted-foreground)]">
        Every one of the {summary.totalArtworks.toLocaleString("en-US")} works in this collection
        can be downloaded at the largest size we hold, free, without an account and without
        attribution. {fullSizeCount.toLocaleString("en-US")} of them come from scans wider than{" "}
        {LADDER_MAX_WIDTH.toLocaleString("en-US")} px and download at their full source resolution —
        up to 16,384 px on the long side.
      </p>

      <section id="what-you-get" className="mt-10 space-y-3">
        <h2 className="font-serif text-2xl">What you get, and what you don&rsquo;t</h2>
        <p className="leading-relaxed">
          Files are <strong>AVIF</strong>, encoded at quality 60 from the source scan. That is the
          format the entire catalogue is built in — the site serves no JPEGs. AVIF opens natively in
          every current browser, in macOS Preview, in GIMP and in Affinity; Photoshop needs a
          plugin. Where a 1,280 px WebP exists it is offered alongside, for tools that still
          can&rsquo;t read AVIF.
        </p>
        <p className="leading-relaxed">
          What you cannot download here is the untouched original file the scan arrived as. Those
          are not published: the build pipeline derives the variant ladder from them and only the
          ladder is mirrored to storage, so an &ldquo;original&rdquo; link would 404 for roughly a
          third of the catalogue and for every Redouté plate. Rather than ship a button that fails,
          the largest offered size is the largest file that actually exists — which for the{" "}
          {fullSizeCount.toLocaleString("en-US")} big scans is the full source resolution anyway,
          re-encoded rather than resampled.
        </p>
        <p className="leading-relaxed">
          Sizes below {LADDER_MAX_WIDTH.toLocaleString("en-US")} px come from the standard ladder:
          256, 480, 640, 960, 1280, 1920, 2560 and 4096 px. Only the widths a given work was
          actually encoded at are ever linked.
        </p>
      </section>

      <section id="collections" className="mt-12 space-y-4">
        <h2 className="font-serif text-2xl">Complete collections</h2>
        <p className="leading-relaxed text-[var(--muted-foreground)]">
          Four sets in the catalogue were published as numbered plate series rather than assembled
          by a curator, so each is offered as a single archive. Archives are generated on request
          and streamed — nothing is stored prebuilt, so what you download always matches what the
          site is showing. Plates inside are {ZIP_VARIANT_WIDTH.toLocaleString("en-US")} px AVIF,
          which prints an A3 sheet at 200 dpi. For a bigger file of one particular plate, use that
          plate&rsquo;s own page.
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
        <h2 className="font-serif text-2xl">The highest-resolution works</h2>
        <p className="leading-relaxed text-[var(--muted-foreground)]">
          The twelve biggest scans in the collection, by pixel width.
        </p>
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
        <h2 className="font-serif text-2xl">Licence and attribution</h2>
        <p className="leading-relaxed">
          Nearly everything here is in the public domain: no copyright, no licence to comply with,
          no attribution required. You can print it, sell it, crop it, feed it to a model, put it on
          a product. A small number of works carry a Creative Commons licence instead — each artwork
          page states which, and links the licence text.
        </p>
        <p className="leading-relaxed">
          Each artwork page also carries a ready-made credit line, and every archive ships a{" "}
          <code>README.txt</code> with one per plate. Using them is a courtesy to the institutions
          that paid for the scanning, not an obligation.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl">Looking for something specific?</h2>
        <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">
          Browse{" "}
          <Link href="/artists" className="underline underline-offset-4">
            by artist
          </Link>
          ,{" "}
          <Link href="/eras" className="underline underline-offset-4">
            by era
          </Link>{" "}
          or{" "}
          <Link href="/timeline" className="underline underline-offset-4">
            along the timeline
          </Link>
          . Every artwork page has its own download panel.
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
