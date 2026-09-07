// Download surface for the catalogue.
//
// The hard constraint this module encodes: **originals are not servable.**
// `scripts/shrink-sources.mjs` never copies an original into `assets-web/`,
// and only `assets-web/` is mirrored to R2 (see the header of
// `scripts/verify-r2.mjs`). A ~37% sample of `assetUrl()` originals 404s on
// the CDN today — the ones that answer are strays from an older pipeline,
// not a contract, and the Redouté folders resolve at 0%. So every download
// offered here addresses a *variant* from the `variantWidths` manifest, and
// the UI says "largest available" rather than "original".
//
// The good news is that the largest available is genuinely large: sources
// wider than 4,096 px get a per-source full-size AVIF on top of the standard
// ladder (`FULL_SIZE_MAX` in variant-config.mjs, long side clamped to
// 16,384 px). 968 works carry one, topping out at 16,384 px / ~34 MB.

import type { Artwork, ArtworkListing } from "@/lib/data";
import { getLicenseInfo } from "@/lib/license";
import { sourceLabel } from "@/lib/source-label";
import { slugify, VARIANT_WIDTHS, type VariantFormat } from "@/lib/utils";

/** Widest rung of the standard responsive ladder. Anything above it is a
 *  per-source full-size AVIF, which is what makes the "high resolution
 *  download" queries answerable at all. */
export const LADDER_MAX_WIDTH = Math.max(...VARIANT_WIDTHS);

/** The only width `shrink-sources.mjs` encodes as WebP (FORMATS caps the
 *  webp entry at [1280]). Offered as a compatibility download because a
 *  fair number of desktop editors still can't open AVIF. */
export const WEBP_WIDTH = 1280;

export type DownloadOption = {
  width: number;
  format: VariantFormat;
  /** Human label for the row, e.g. "9361 × 16384 px". */
  label: string;
  /** True for the single largest option — the default the UI leads with. */
  isLargest: boolean;
  /** True when this width came from the per-source full-size encode rather
   *  than the standard ladder. */
  isFullSize: boolean;
  /** Pixel height at this width, when the source aspect ratio is known. */
  height: number | null;
};

type Sizeable = Pick<ArtworkListing, "variantWidths" | "width" | "height">;

/**
 * The widths we may legitimately link to, largest first.
 *
 * Only widths present in `variantWidths` are emitted. That manifest is a
 * directory scan done by `build-data.mjs`, so it is the ground truth for
 * what `pnpm assets:shrink` actually produced — offering anything else
 * 404s, which is the exact failure mode `variantSrcSet` was fixed for in
 * 32e4702. When the manifest is missing we fall back to the standard
 * ladder, the same bet `fallbackVariantUrl` makes.
 */
export function downloadOptions(art: Sizeable): DownloadOption[] {
  const widths =
    art.variantWidths && art.variantWidths.length > 0 ? art.variantWidths : VARIANT_WIDTHS;

  // Descending, deduped, and defensive about a manifest that arrives
  // unsorted — build-data sorts it, but this list drives href generation.
  const sorted = Array.from(new Set(widths)).sort((a, b) => b - a);
  if (sorted.length === 0) return [];

  const aspect = art.width && art.height && art.width > 0 ? art.height / art.width : null;

  const options: DownloadOption[] = sorted.map((width, i) => ({
    width,
    format: "avif" as const,
    label: labelFor(width, aspect),
    isLargest: i === 0,
    isFullSize: width > LADDER_MAX_WIDTH,
    height: aspect ? Math.round(width * aspect) : null,
  }));

  // WebP exists only at 1280 and only when that rung was built. Appended
  // rather than interleaved so the AVIF ladder reads as one sequence.
  if (sorted.includes(WEBP_WIDTH)) {
    options.push({
      width: WEBP_WIDTH,
      format: "webp",
      label: labelFor(WEBP_WIDTH, aspect),
      isLargest: false,
      isFullSize: false,
      height: aspect ? Math.round(WEBP_WIDTH * aspect) : null,
    });
  }

  return options;
}

function labelFor(width: number, aspect: number | null): string {
  if (!aspect) return `${width.toLocaleString("en-US")} px wide`;
  return `${width.toLocaleString("en-US")} × ${Math.round(width * aspect).toLocaleString("en-US")} px`;
}

/** The option the download UI defaults to, or null when nothing was built. */
export function largestDownload(art: Sizeable): DownloadOption | null {
  return downloadOptions(art).find((o) => o.isLargest) ?? null;
}

/** True when this work has a per-source full-size encode beyond the
 *  standard ladder — i.e. the source was wider than 4,096 px. */
export function hasFullSizeDownload(art: Sizeable): boolean {
  return largestDownload(art)?.isFullSize === true;
}

/**
 * Filename handed to the browser via Content-Disposition. Slugified so it
 * survives every filesystem, and width-stamped so someone downloading two
 * rungs of the same work doesn't get "foo (1).avif".
 */
export function downloadFilename(
  art: Pick<Artwork, "title" | "englishTitle" | "artist">,
  width: number,
  format: VariantFormat,
): string {
  const name = slugify(art.englishTitle ?? art.title) || "artwork";
  const artist = art.artist ? slugify(art.artist) : "";
  const stem = artist ? `${artist}-${name}` : name;
  return `${stem.slice(0, 100)}-${width}px.${format}`;
}

/**
 * The attribution line shown next to the download and embedded in every
 * collection ZIP. Public-domain works carry no legal requirement to
 * attribute, which is exactly why it's worth making the courtesy version
 * copy-pasteable rather than leaving people to invent one.
 */
export function attributionText(
  art: Pick<
    Artwork,
    "title" | "englishTitle" | "artist" | "year" | "license" | "commonsUrl" | "credit"
  >,
): string {
  const info = getLicenseInfo(art.license);
  const bits = [art.englishTitle ?? art.title];
  if (art.artist) bits.push(art.artist);
  if (art.year) bits.push(String(art.year));

  const source = cleanCredit(art.credit) ?? sourceLabel(art.commonsUrl);
  // "Source:" rather than "Digitised by": `credit` is an institution for
  // some folders (audubon-birds is "University of Pittsburgh") and a plate
  // caption for others (kunstformen-images), and only the neutral label
  // reads correctly for both.
  const tail = info.isPublicDomain
    ? `${info.short}. Source: ${source}.`
    : `Licensed ${info.short}. Source: ${source}.`;

  return `${bits.join(", ")}. ${tail}`;
}

/**
 * Trim scrape artifacts off a credit line.
 *
 * Commons captions carry inline footnote links that flatten to a dangling
 * "(see here , here and here )" once the markup is gone. It's noise in a
 * credit line and it's the first thing a reader sees in an archive README,
 * so it goes. Anything that trims to nothing falls back to the source host.
 */
function cleanCredit(credit: string | null | undefined): string | null {
  if (!credit) return null;
  const cleaned = credit
    .replace(/\s*\(\s*see\s+here[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:]+$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
