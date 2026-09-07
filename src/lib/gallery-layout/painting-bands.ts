// Classify an artwork as small / medium / large from its real-world
// dimensions.
//
// The band no longer steers placement: the corridor/big-room split it
// was written for is gone (hallways are permanently empty and rooms
// hang a single continuous wall run). `place-paintings.ts` still stamps
// it onto every Placement, but no consumer reads `Placement.band` —
// keep that in mind before extending this: it is currently a label, not
// an input to the hang.

import type { ArtworkListing } from "@/lib/data";
import type { Band } from "./types";

export const SMALL_MAX_CM = 60; // max dimension < this → "small"
export const LARGE_MIN_CM = 150; // max dimension > this → "large"

export function artworkBand(artwork: ArtworkListing): Band {
  const dims = artwork.realDimensions;
  if (!dims) return "medium"; // unknown size → medium is the safe middle
  const maxDim = Math.max(dims.widthCm, dims.heightCm);
  if (maxDim < SMALL_MAX_CM) return "small";
  if (maxDim > LARGE_MIN_CM) return "large";
  return "medium";
}

export function partitionByBand(artworks: ArtworkListing[]): Record<Band, ArtworkListing[]> {
  const out: Record<Band, ArtworkListing[]> = { small: [], medium: [], large: [] };
  for (const a of artworks) {
    out[artworkBand(a)].push(a);
  }
  return out;
}
