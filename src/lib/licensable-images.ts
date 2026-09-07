// Which image variants we advertise to crawlers, and at what pixel size.
//
// Two consumers, one rule set:
//   - `artworkJsonLd()` in seo.ts, which nests these as schema.org
//     ImageObject entries so Google can attach the "Free to use" (a.k.a.
//     licensable) badge in Google Images.
//   - `src/app/sitemap.ts`, which emits one <image:image> per artwork URL.
//
// The hard constraint on both is that every URL we name must actually be
// servable. Only `assets-web/` is mirrored to R2; originals are absent by
// design (see the header of scripts/verify-r2.mjs), and a ladder rung that
// wasn't encoded for a given work 404s. So the set is always derived from
// the work's own `variantWidths` manifest, never from an assumption.

import { fallbackVariant, publicVariantUrl, VARIANT_WIDTHS, type VariantFormat } from "@/lib/utils";

/**
 * Larger rungs advertised alongside the primary, biggest first. Both sit
 * in the AVIF srcSet the detail page renders, so a crawler that walked
 * the srcSet has already seen these exact URLs.
 *
 * 4096 is deliberately excluded: shrink-sources emits it for the 3D
 * gallery's close-up LOD, and the 2D `<picture>` tops out at 2560. Naming
 * a multi-megabyte file Googlebot would otherwise never fetch buys
 * nothing and costs bandwidth on every crawl. The gallery's other
 * close-up rung, GALLERY_LOD_WIDTH (6144), is excluded on the same
 * grounds — it exists only for GPU texture upload.
 *
 * The per-source full-size rung is excluded for the same reason, and more
 * strongly. Note it is no longer characterised by "the 11k–16k px entries
 * in `variantWidths`": a full-size rung can be as small as ~4.1k px and
 * therefore sit BELOW a 6144 gallery rung in the same manifest. This
 * allowlist sidesteps that entirely by naming the widths it wants rather
 * than reasoning about the manifest's shape.
 */
const EXTRA_LICENSABLE_WIDTHS = [2560, 1920] as const;

export type ImageVariantRef = {
  /** Ladder rung — the number in the variant's filename. */
  width: number;
  format: VariantFormat;
  /**
   * Actual encoded pixel dimensions, or null when the source dimensions
   * aren't known. Not simply `width`: shrink-sources.mjs resizes with
   * `withoutEnlargement: true`, so a rung wider than the source is
   * written at the *source's* width under the rung's filename. Claiming
   * `"width": 2560` for a file that is 1400 px wide is a structured-data
   * lie Google can check by fetching the image.
   */
  pixelWidth: number | null;
  pixelHeight: number | null;
};

export type LicensableImageSource = {
  variantWidths?: readonly number[] | null;
  /** Intrinsic pixel dimensions of the original (Artwork.width/height). */
  width?: number | null;
  height?: number | null;
};

/**
 * Variants to advertise for one artwork, most-canonical first.
 *
 * The first entry is whatever `fallbackVariantUrl()` resolves to — i.e.
 * the exact URL the page's `<img src>` carries. That ordering is load
 * bearing: the licence metadata is only useful if it lands on the image
 * Google actually crawled, and the `<img src>` is the one URL every
 * crawler resolves regardless of AVIF support.
 */
export function licensableVariants(source: LicensableImageSource): ImageVariantRef[] {
  const widths =
    source.variantWidths && source.variantWidths.length > 0 ? source.variantWidths : VARIANT_WIDTHS;

  const primary = fallbackVariant(widths);
  const refs: { width: number; format: VariantFormat }[] = [primary];

  for (const w of EXTRA_LICENSABLE_WIDTHS) {
    if (!widths.includes(w)) continue;
    if (w === primary.width && primary.format === "avif") continue;
    refs.push({ width: w, format: "avif" });
  }

  return refs.map((ref) => ({
    ...ref,
    ...encodedSize(ref.width, source.width, source.height),
  }));
}

/** The single variant the crawler should be pointed at from the sitemap. */
export function primaryLicensableVariant(source: LicensableImageSource): ImageVariantRef {
  return licensableVariants(source)[0];
}

/** MIME type for a variant format — schema.org `encodingFormat`. */
export function encodingFormat(format: VariantFormat): string {
  return format === "webp" ? "image/webp" : "image/avif";
}

function encodedSize(
  rungWidth: number,
  srcWidth: number | null | undefined,
  srcHeight: number | null | undefined,
): { pixelWidth: number | null; pixelHeight: number | null } {
  if (!srcWidth || !srcHeight || srcWidth <= 0 || srcHeight <= 0) {
    return { pixelWidth: null, pixelHeight: null };
  }
  const w = Math.min(rungWidth, srcWidth);
  return { pixelWidth: w, pixelHeight: Math.max(1, Math.round((srcHeight * w) / srcWidth)) };
}

/**
 * The image URLs to list under an artwork's `<url>` entry in the sitemap.
 *
 * One entry, not the whole ladder: an image sitemap exists to tell Google
 * *which page an image belongs to*, and repeating the same picture at
 * three widths just multiplies fetches for one indexed result. The one we
 * name is the page's own `<img src>`, so the sitemap, the rendered page,
 * and the JSON-LD `contentUrl` all point at the same file.
 *
 * `publicVariantUrl` rather than `variantUrl` because sitemap locations
 * must be absolute. The two resolve identically in production (both read
 * NEXT_PUBLIC_ASSETS_BASE_URL); the difference only shows in dev, where
 * `variantUrl` returns the same-origin `/assets-raw` proxy path that
 * would be meaningless in the XML.
 *
 * An artwork with no objectKey contributes no image rather than an empty
 * `<image:loc>`.
 */
export function sitemapImagesForArtwork(
  artwork: LicensableImageSource & { objectKey: string },
): string[] | undefined {
  if (!artwork.objectKey) return undefined;
  const variant = primaryLicensableVariant(artwork);
  return [publicVariantUrl(artwork.objectKey, variant.width, variant.format)];
}
