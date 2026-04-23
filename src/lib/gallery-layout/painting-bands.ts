// Classify an artwork as small / medium / large from its real-world
// dimensions. Small works populate corridors; large works get the big
// rooms; medium fills the remaining wall slots.

import type { Artwork } from "@/lib/data";
import type { Band } from "./types";

export const SMALL_MAX_CM = 60;   // max dimension < this → "small"
export const LARGE_MIN_CM = 150;  // max dimension > this → "large"

export function artworkBand(artwork: Artwork): Band {
  const dims = artwork.realDimensions;
  if (!dims) return "medium"; // unknown size → medium is the safe middle
  const maxDim = Math.max(dims.widthCm, dims.heightCm);
  if (maxDim < SMALL_MAX_CM) return "small";
  if (maxDim > LARGE_MIN_CM) return "large";
  return "medium";
}

export function partitionByBand(artworks: Artwork[]): Record<Band, Artwork[]> {
  const out: Record<Band, Artwork[]> = { small: [], medium: [], large: [] };
  for (const a of artworks) {
    out[artworkBand(a)].push(a);
  }
  return out;
}
