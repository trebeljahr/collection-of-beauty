import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { artworkBand, LARGE_MIN_CM, partitionByBand, SMALL_MAX_CM } from "./painting-bands";

// Minimal listing-shape factory so each test can spell out just the
// fields the function under test reads. Stops the suite breaking
// whenever an unrelated field is added to ArtworkListing.
function makeArtwork(
  overrides: Partial<ArtworkListing> & { widthCm?: number; heightCm?: number },
): ArtworkListing {
  const { widthCm, heightCm, ...rest } = overrides;
  return {
    id: "test",
    title: "test",
    englishTitle: null,
    artist: null,
    artistSlug: "unknown",
    year: null,
    movement: null,
    nationality: null,
    objectKey: "x/test.jpg",
    variantWidths: null,
    width: null,
    height: null,
    realDimensions:
      widthCm != null && heightCm != null ? { widthCm, heightCm, source: "static" } : null,
    ...rest,
  };
}

describe("artworkBand", () => {
  it("falls back to medium when realDimensions is missing", () => {
    // The vast majority of the corpus lacks Wikidata dimensions; the
    // safe-middle default keeps unknowns out of both corridor walls
    // (too small) and the grand-hall slots (too large).
    expect(artworkBand(makeArtwork({}))).toBe("medium");
  });

  it("uses the longest side, not area, to classify", () => {
    // A 60 × 200 cm strip is "large" — corridor walls can't hang it
    // and a small-room placement would have it touch ceiling.
    expect(artworkBand(makeArtwork({ widthCm: 60, heightCm: 200 }))).toBe("large");
  });

  it("treats the band thresholds as strict (not inclusive)", () => {
    // Boundary-exact: SMALL_MAX_CM is the supremum of "small" (>= → medium),
    // LARGE_MIN_CM is the infimum of "large" (<= → medium).
    expect(artworkBand(makeArtwork({ widthCm: SMALL_MAX_CM - 1, heightCm: 30 }))).toBe("small");
    expect(artworkBand(makeArtwork({ widthCm: SMALL_MAX_CM, heightCm: 30 }))).toBe("medium");
    expect(artworkBand(makeArtwork({ widthCm: LARGE_MIN_CM, heightCm: 30 }))).toBe("medium");
    expect(artworkBand(makeArtwork({ widthCm: LARGE_MIN_CM + 1, heightCm: 30 }))).toBe("large");
  });
});

describe("partitionByBand", () => {
  it("preserves input order within each band", () => {
    // Stable partition matters for the placement algorithm — slots
    // are filled in supply order so the first painting in the input
    // list lands in the first slot of its band, not somewhere shuffled.
    const a = makeArtwork({ id: "a", widthCm: 40, heightCm: 30 });
    const b = makeArtwork({ id: "b", widthCm: 200, heightCm: 100 });
    const c = makeArtwork({ id: "c", widthCm: 30, heightCm: 50 });
    const out = partitionByBand([a, b, c]);
    expect(out.small.map((x) => x.id)).toEqual(["a", "c"]);
    expect(out.large.map((x) => x.id)).toEqual(["b"]);
    expect(out.medium).toEqual([]);
  });
});
