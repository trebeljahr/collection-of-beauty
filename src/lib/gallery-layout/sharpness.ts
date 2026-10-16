// Which works are sharp enough to hang.
//
// A work is judged at its real size, up to 3.2 m: the tower hangs no
// larger, and the block plan, which hangs larger works at their real
// size, admits the same works. The museum's largest
// texture for it is a ladder rung: 4096 px wide, or 6144 px where the
// source is big enough for that rung to exist. A 3 m canvas from a
// 900 px scan is 300 texture pixels a metre, and a visitor who walks up
// to it sees the pixels. Such a work stays off the walls. It keeps its
// page on the site, where it is shown at the size its scan supports.

import type { ArtworkListing } from "@/lib/data";
import { GALLERY_LOD_WIDTH, VARIANT_WIDTHS } from "@/lib/variant-config.mjs";
import { sizeWork } from "./place-paintings";

/** Texture pixels a work needs for each metre of its hung width.
 *
 *  At the museum's 75° vertical field of view a 2560 px wide screen
 *  shows 2.73 m of wall from one metre away: 938 screen pixels a metre.
 *  So this is one texture pixel to a screen pixel for a visitor standing
 *  a metre from the wall. It cannot go much higher: a 3.2 m canvas on
 *  the 4096 px rung has 1,280. */
export const MIN_TEXTURE_PX_PER_METRE = 1000;

const LADDER_TOP = Math.max(...VARIANT_WIDTHS);

type Sizable = Pick<ArtworkListing, "width" | "height" | "variantWidths" | "realDimensions">;

/** Widest texture the museum will load for a work, in real pixels. A
 *  `variantWidths` entry is a filename: shrink clamps the pixels to the
 *  source, so the source width caps every rung. */
export function widestTexturePx(artwork: Sizable): number | null {
  if (!artwork.width || !artwork.height) return null;
  const top = artwork.variantWidths?.includes(GALLERY_LOD_WIDTH) ? GALLERY_LOD_WIDTH : LADDER_TOP;
  return Math.min(artwork.width, top);
}

/** Texture pixels per metre of the work as it hangs, or null when the
 *  source's pixel size is unknown. */
export function texturePxPerMetre(artwork: Sizable): number | null {
  const px = widestTexturePx(artwork);
  if (px == null) return null;
  return px / sizeWork(artwork as ArtworkListing).wM;
}

/** False for a work a visitor would see as blurred from a metre away.
 *  A work of unknown pixel size is not judged and hangs. */
export function sharpEnoughToHang(artwork: Sizable): boolean {
  const density = texturePxPerMetre(artwork);
  return density == null || density >= MIN_TEXTURE_PX_PER_METRE;
}
