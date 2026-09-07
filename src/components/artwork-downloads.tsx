// Download panel on /artwork/[id].
//
// Server-rendered plain anchors, deliberately. "public domain <artist>
// high resolution download" is the query this answers, and a crawler that
// runs no JavaScript has to be able to read the sizes, the licence and the
// attribution as text. No client component, no fetch-on-click. The smaller
// rungs collapse into a <details>, which is still plain markup in the HTML.

import { buttonVariants } from "@/components/ui/button";
import { collectionForFolder } from "@/lib/collections";
import type { Artwork } from "@/lib/data";
import { displayTitle } from "@/lib/data";
import { attributionText, type DownloadOption, downloadOptions } from "@/lib/downloads";
import { getLicenseInfo } from "@/lib/license";
import { cn } from "@/lib/utils";

function href(id: string, option: DownloadOption): string {
  return `/api/download/${id}?w=${option.width}&f=${option.format}`;
}

// Deliberately no byte-size estimates next to the sizes.
//
// The obvious approach — pixel count times a bytes-per-pixel constant for
// AVIF q=60 — does not survive contact with the corpus. Measured across
// 3,289 built variants, bytes/px spans p10 0.005 to p90 0.10 *within the
// 4096 rung alone*: a flat engraving and a dense oil painting differ by
// more than 10x at identical dimensions. A single constant mislabels a
// 1.7 MB file as "~6 MB", which is worse than saying nothing.
//
// Honest sizes need the real byte count per variant, which means recording
// it in build-data.mjs's directory scan alongside `variantWidths`. Until
// then the pixel dimensions — which are exact — are what we show.

export function ArtworkDownloads({ artwork }: { artwork: Artwork }) {
  // AVIF only. The 1280 WebP rung exists as a compatibility fallback for
  // editors that can't open AVIF, but listing it beside the AVIF ladder
  // reads as a second, confusing sequence. `/api/download` still serves it.
  const options = downloadOptions(artwork).filter((o) => o.format === "avif");
  if (options.length === 0) return null;

  const largest = options[0];
  const rest = options.slice(1);
  const license = getLicenseInfo(artwork.license);
  const attribution = attributionText(artwork);
  const collection = collectionForFolder(artwork.folder);

  return (
    <section id="download" className="space-y-3 border-t border-[var(--border)] pt-5">
      <h2 className="font-serif text-lg">Download</h2>

      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
        {license.isPublicDomain ? (
          <>Public domain: no permission needed, no attribution required.</>
        ) : (
          <>Licensed {license.short} — check the terms before reusing.</>
        )}{" "}
        Files are AVIF.
      </p>

      {/*
        Two atomic labels rather than one string, because the shared button
        base is `whitespace-nowrap`: as a single string this CTA measured
        311 px at min-content and could not shrink, so any viewport under
        343 px (311 + the 2×16 px page padding) widened the whole sidebar
        and scrolled the document sideways — iPhone SE, Fold outer screen.
        `flex-wrap` sizes off content instead of a breakpoint: the verb and
        the dimensions each stay unbroken and the dimensions drop to a
        second row only when the column can't seat both, which also covers
        the ~306 px the aside gets from `1.3fr_1fr` at exactly 768 px — a
        `sm:` re-join would have broken again one step later. Min-content
        is then ~165 px. `h-auto min-h-9` so the second row isn't clipped;
        py-2 reproduces the 36 px height while it's on one line. No em dash
        between the two — it would lead a wrapped line with a dangling "—";
        the opacity separates them in both layouts and stays far past
        4.5:1 on `--primary` in either theme.
      */}
      <a
        href={href(artwork.id, largest)}
        className={cn(
          buttonVariants({ variant: "default", size: "default" }),
          "h-auto min-h-9 flex-wrap gap-x-2 gap-y-0.5 py-2",
        )}
        // Same-origin, so the browser honours this and the proxy's
        // Content-Disposition supplies the real filename.
        download
      >
        <span className="inline-flex items-center gap-2">
          <DownloadIcon />
          Download largest
        </span>
        <span className="tabular-nums opacity-80">{largest.label}</span>
      </a>

      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none text-sm underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            Other sizes ({rest.length})
          </summary>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {rest.map((option) => (
              <li key={`${option.width}-${option.format}`}>
                <a
                  href={href(artwork.id, option)}
                  download
                  className="rounded-sm underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {option.width.toLocaleString("en-US")} px
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Credit line (optional)
        </p>
        <p className="font-mono text-xs leading-relaxed break-words">{attribution}</p>
      </div>

      {collection && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {displayTitle(artwork)} is one plate from {collection.title}.{" "}
          <a href={`/collection/${collection.slug}`} className="underline underline-offset-4">
            Download the complete set
          </a>
          .
        </p>
      )}
    </section>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none">
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
