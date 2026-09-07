import { deepZoomSize, TILE_MIN_WIDTH, TILE_OVERLAP, TILE_SIZE } from "./deep-zoom-config.mjs";
import { deepZoomTileUrl } from "./utils";

/** The shape OpenSeadragon calls a "custom tile source": enough geometry
 *  to lay out the pyramid, plus a function that turns a level/col/row
 *  triple into a URL. Declared structurally so nothing in this module has
 *  to import OpenSeadragon — it stays a pure, testable object that the
 *  lazily-loaded viewer hands straight to the constructor. */
export type DeepZoomTileSource = {
  width: number;
  height: number;
  tileSize: number;
  tileOverlap: number;
  minLevel: number;
  maxLevel: number;
  getTileUrl: (level: number, x: number, y: number) => string;
};

// Note on availability: a work has a pyramid exactly when the shrink
// pipeline emitted a per-source full-resolution variant for it, which is
// already readable from `variantWidths` — so this is derived from
// catalogue data rather than stored. A dedicated `hasTiles` field would
// put a redundant boolean into the RSC payload of every gallery page for
// information the payload already carries.
//
// The tradeoff is that availability is asserted from the catalogue, not
// from the bucket: a catalogue rebuilt ahead of the tiler or of
// `pnpm assets:sync` will claim tiles that 404. The viewer treats that as
// recoverable and falls back to the plain image.

/**
 * Build the OpenSeadragon tile source for a work, or null when it has no
 * pyramid.
 *
 * `maxLevel` is stated explicitly even though OpenSeadragon would derive
 * the same value, because it is the one number that must match what
 * libvips `dzsave` actually wrote — being explicit keeps the agreement
 * visible next to the geometry it depends on rather than buried in a
 * library default.
 */
export function deepZoomTileSource(
  objectKey: string,
  variantWidths: readonly number[] | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): DeepZoomTileSource | null {
  if (!objectKey) return null;
  const size = deepZoomSize(variantWidths, width, height);
  if (!size) return null;
  return {
    width: size.width,
    height: size.height,
    tileSize: TILE_SIZE,
    tileOverlap: TILE_OVERLAP,
    minLevel: 0,
    maxLevel: Math.ceil(Math.log2(Math.max(size.width, size.height))),
    getTileUrl: (level, x, y) => deepZoomTileUrl(objectKey, level, x, y),
  };
}

/**
 * The widest variant that is safe to fetch as a SINGLE image.
 *
 * Normally the answer is just the last entry of `variantWidths`. The
 * exception is a work that carries an above-ladder full-size encode but
 * has NO pyramid to stream it progressively, which happens when the
 * catalogue is missing its source dimensions: `deepZoomSize` needs them
 * to compute the geometry, and so does `scripts/build-tiles.mjs`, so the
 * work loses the pyramid and keeps the 16,384 px AVIF. Exactly one
 * catalogued work is in that position (the Boilly conscrits), and it is
 * the one work where the lightbox's "skip the eager preload for tiled
 * works" guard does not fire — so it eagerly downloaded a 15 MB file to
 * show it in a modal, which is the download the pyramid exists to avoid.
 *
 * Falling back to the widest ladder rung there costs nothing real: with
 * no pyramid there is no way to reach true source detail in the viewer
 * anyway, and the full-size copy is still offered on the downloads page.
 */
export function largestSingleImageWidth(
  variantWidths: readonly number[] | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): number | null {
  if (!variantWidths || variantWidths.length === 0) return null;
  const max = variantWidths[variantWidths.length - 1];
  // Within the ladder, or streamable as tiles — either way the manifest
  // max is the right answer. (For a tiled work this URL is only ever the
  // fallback used when the pyramid turns out not to be on the bucket.)
  if (max <= TILE_MIN_WIDTH) return max;
  if (deepZoomSize(variantWidths, width, height)) return max;
  let best = variantWidths[0];
  for (const w of variantWidths) {
    if (w <= TILE_MIN_WIDTH && w > best) best = w;
  }
  return best;
}
