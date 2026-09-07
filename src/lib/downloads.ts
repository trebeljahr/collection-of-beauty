// Download surface for the catalogue.
//
// Originals are not servable. `scripts/shrink-sources.mjs` never copies one
// into `assets-web/`, and only `assets-web/` is mirrored to R2 (see the
// header of `scripts/verify-r2.mjs`). A ~37% sample of `assetUrl()`
// originals 404s on the CDN; the Redouté folders resolve at 0%. So every
// download here addresses a *variant* from the `variantWidths` manifest,
// and the UI says "largest available" rather than "original".
//
// Sources whose full-size encode clears `FULL_SIZE_MIN_WIDTH` (4,096 px) get
// a per-source full-size AVIF on top of the standard ladder (`FULL_SIZE_MAX`
// in variant-config.mjs, long side clamped to 16,384 px). 968 works carry
// one, topping out at ~34 MB.
//
// Those manifests can carry a SECOND above-ladder width: `GALLERY_LOD_WIDTH`
// (6,144 px), the 3D gallery's close-up texture rung. It is emitted only
// below a strictly larger full-size rung, so it is never the largest entry —
// which is how `isFullSize` below can tell the two apart by position alone.

import type { Artwork, ArtworkListing } from "@/lib/data";
import { getLicenseInfo } from "@/lib/license";
import { sourceLabel } from "@/lib/source-label";
import { GALLERY_LOD_WIDTH, slugify, VARIANT_WIDTHS, type VariantFormat } from "@/lib/utils";

/** Widest rung of the standard responsive ladder — the widest width every
 *  shrunk work carries. Anything above it came from a per-source encode:
 *  either the full-size AVIF or the 3D gallery's 6,144 px LOD rung. */
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
   *  than the standard ladder or the gallery's close-up LOD rung. */
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

  // `isFullSize` is "above the ladder AND not the gallery LOD rung". The
  // position test is what disambiguates: shrink-sources.mjs emits
  // GALLERY_LOD_WIDTH only when a strictly larger full-size rung exists, so
  // a 6,144 entry at index > 0 is that rung, while a 6,144 entry leading the
  // list is a genuine full-size encode that happened to land on the number.
  // Comparing against LADDER_MAX_WIDTH alone would flag the LOD rung as a
  // full-size download and put a second "full resolution" row on the page.
  const options: DownloadOption[] = sorted.map((width, i) => ({
    width,
    format: "avif" as const,
    label: labelFor(width, aspect),
    isLargest: i === 0,
    isFullSize: width > LADDER_MAX_WIDTH && !(width === GALLERY_LOD_WIDTH && i > 0),
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
 *  standard ladder — i.e. its full-size width cleared FULL_SIZE_MIN_WIDTH.
 *
 *  Very nearly, but NOT exactly, "the work has a DZI tile pyramid". Both
 *  ride the same width threshold, but the tiler additionally needs source
 *  dimensions to compute the pyramid geometry (`deepZoomSize` returns null
 *  without them), and one catalogued work — the Boilly conscrits, whose
 *  manifest tops out at 16384 — has `width`/`height` null. It has the
 *  full-size download and no pyramid. Don't invert this into an
 *  availability check for deep zoom; use `deepZoomSize` for that. */
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
 * attribute; this is the courtesy version, ready to copy.
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
 * "(see here , here and here )" once the markup is gone. Anything that
 * trims to nothing falls back to the source host.
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
