import { deepZoomSize, TILE_OVERLAP, TILE_SIZE } from "./deep-zoom-config.mjs";
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
