// Deep-zoom (DZI) tile pyramid parameters. Single source of truth shared
// between:
//   - scripts/build-tiles.mjs (build-time tiler — runs libvips dzsave)
//   - src/lib/deep-zoom.ts    (runtime tile-source builder for OpenSeadragon)
//
// Lives as `.mjs` for the same reason variant-config.mjs does: Node
// imports it natively from the build script, and Next's bundler resolves
// it from the runtime side. The two sides MUST agree on every value here
// — a mismatch in TILE_SIZE or TILE_OVERLAP makes OpenSeadragon request
// tile coordinates that were never written, which shows as a grid of
// permanently blank squares rather than a clean failure.

/** Tile edge in px. 512 keeps the tile count (and therefore the R2 object
 *  count) about 4× lower than the DZI-classic 256 while staying small
 *  enough that a pan only ever decodes a few hundred KB. */
export const TILE_SIZE = 512;

/** Pixels of overlap baked into each tile's right/bottom edge. 1 px is
 *  the DZI convention — it hides the seam that bilinear filtering would
 *  otherwise draw between adjacent tiles. */
export const TILE_OVERLAP = 1;

/** Tile encoding. libvips `dzsave` only emits jpeg/png/webp (AVIF is not
 *  a valid dzsave suffix), so WebP is the best available: universally
 *  supported since 2020 and materially faster to decode than AVIF, which
 *  matters when a single pan decodes dozens of tiles. */
export const TILE_FORMAT = "webp";

/** Subdirectory under an artwork's existing variant dir that holds the
 *  pyramid: assets-web/<folder>/<basename>/tiles/<level>/<col>_<row>.webp
 *  Nesting it there means scripts/sync-assets.sh mirrors it to R2 with no
 *  changes, and the dev asset server already serves the path. */
export const TILE_DIR = "tiles";

/** A work gets a pyramid exactly when the shrink pipeline emitted a
 *  per-source full-resolution variant for it — i.e. when its source was
 *  bigger than the standard ladder's max. That full-size width is the
 *  last entry of `variantWidths`, so both the tiler and the runtime can
 *  derive "has tiles" from catalogue data alone, with no extra field in
 *  src/data/artworks.json and no extra bytes in the RSC payload.
 *
 *  Kept in sync with VARIANT_WIDTHS' max by construction: this is the
 *  same `longSide > MAX_WIDTH` predicate shrink-sources.mjs applies. */
export const TILE_MIN_WIDTH = 4096;

/**
 * Pixel dimensions of the tiled pyramid for an artwork.
 *
 * The pyramid is built at the same width as the full-size AVIF variant
 * (whose width IS its filename, hence `maxVariantWidth`), so the two
 * top out at identical detail. Height is derived from the source aspect
 * ratio rather than read off disk, so the build script and the runtime
 * compute the same number from the same inputs — the tiler then resizes
 * to exactly this pair instead of letting `fit: "inside"` round
 * independently. A one-pixel disagreement here would change
 * `ceil(height / TILE_SIZE)` on boundary cases and 404 the last row.
 *
 * Returns null when the artwork has no pyramid.
 */
export function deepZoomSize(variantWidths, sourceWidth, sourceHeight) {
  if (!variantWidths || variantWidths.length === 0) return null;
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) return null;
  const maxVariantWidth = variantWidths[variantWidths.length - 1];
  if (!(maxVariantWidth > TILE_MIN_WIDTH)) return null;
  return {
    width: maxVariantWidth,
    height: Math.round((sourceHeight * maxVariantWidth) / sourceWidth),
  };
}
