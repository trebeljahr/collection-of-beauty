import { describe, expect, it } from "vitest";
import { deepZoomTileSource, largestSingleImageWidth } from "./deep-zoom";
import { deepZoomSize, TILE_MIN_WIDTH, TILE_OVERLAP, TILE_SIZE } from "./deep-zoom-config.mjs";
import { FULL_SIZE_MIN_WIDTH, GALLERY_LOD_WIDTH, VARIANT_WIDTHS } from "./variant-config.mjs";

// The standard ladder every shrunk work has, plus (where applicable) the
// per-source full-resolution rung that marks a work as tiled. Imported
// rather than hand-copied: a local literal would keep passing through a
// ladder change, which is exactly the regression these tests guard.
const LADDER = [...VARIANT_WIDTHS];

describe("tile availability threshold", () => {
  // The full-size/tile threshold and the ladder's top rung are the same
  // number today and were once the same expression. They are different
  // policies: growing the ladder must not move the threshold, or every
  // work whose source sits between the old and new max silently loses its
  // pyramid — and the viewers degrade without erroring, so nothing fails.
  it("is the shrink pipeline's full-size threshold, not the ladder max", () => {
    expect(TILE_MIN_WIDTH).toBe(FULL_SIZE_MIN_WIDTH);
  });

  // The invariant the predicate below rests on. GALLERY_LOD_WIDTH is
  // emitted per source and only beneath a strictly larger full-size rung,
  // so it can never be max(variantWidths). Were it a ladder member it
  // would land on every work, `max > TILE_MIN_WIDTH` would be true
  // catalogue-wide, and ~3,600 works with no pyramid would start
  // requesting tiles.
  it("keeps the gallery LOD rung out of the responsive ladder", () => {
    expect(VARIANT_WIDTHS).not.toContain(GALLERY_LOD_WIDTH);
    expect(Math.max(...VARIANT_WIDTHS)).toBeLessThan(GALLERY_LOD_WIDTH);
  });
});

describe("deepZoomSize", () => {
  it("returns null for works that never exceeded the standard ladder", () => {
    expect(deepZoomSize(LADDER, 4096, 3000)).toBeNull();
  });

  it("keeps the pyramid on the full-size rung when a gallery LOD rung sits below it", () => {
    // A work with both above-ladder rungs. The pyramid must be built at
    // the full-size width; taking 6144 instead would hand OpenSeadragon a
    // grid libvips never wrote, which paints as blank squares because the
    // viewers' `tiles/0/0_0.webp` probe still succeeds.
    expect(deepZoomSize([...LADDER, GALLERY_LOD_WIDTH, 10871], 10871, 2897)).toEqual({
      width: 10871,
      height: 2897,
    });
  });

  it("keeps the pyramid for works whose full-size rung falls between 4096 and 6144", () => {
    // 319 catalogue works sit in this band (Sesshu at 4760 is one). They
    // never gain a 6144 rung — the gate requires a strictly larger
    // full-size width — and they must keep the geometry already on disk.
    expect(deepZoomSize([...LADDER, 4760], 4760, 7380)).toEqual({
      width: 4760,
      height: 7380,
    });
  });

  it("returns null when there is no variant manifest at all", () => {
    expect(deepZoomSize(null, 12000, 9000)).toBeNull();
    expect(deepZoomSize([], 12000, 9000)).toBeNull();
  });

  it("returns null when source dimensions are missing or nonsensical", () => {
    expect(deepZoomSize([...LADDER, 9361], null, 21675)).toBeNull();
    expect(deepZoomSize([...LADDER, 9361], 0, 21675)).toBeNull();
    expect(deepZoomSize([...LADDER, 9361], 12384, -1)).toBeNull();
  });

  it("takes the pyramid width from the full-size rung and derives height from the source aspect", () => {
    // Dong Yuan, Mountain Hall: a 12384x21675 source clamped to a 16384 px
    // long side by the shrink pipeline, so the full-size AVIF is 9361 wide.
    expect(deepZoomSize([...LADDER, 9361], 12384, 21675)).toEqual({
      width: 9361,
      height: 16384,
    });
  });

  it("leaves sources that fit under the cap at their own dimensions", () => {
    expect(deepZoomSize([...LADDER, 10871], 10871, 2897)).toEqual({
      width: 10871,
      height: 2897,
    });
  });
});

describe("deepZoomTileSource", () => {
  it("returns null when the work has no pyramid", () => {
    expect(deepZoomTileSource("collection-of-beauty/Small.jpg", LADDER, 4096, 3000)).toBeNull();
  });

  it("returns null for a missing object key", () => {
    expect(deepZoomTileSource("", [...LADDER, 9361], 12384, 21675)).toBeNull();
  });

  it("describes the pyramid libvips actually wrote", () => {
    const src = deepZoomTileSource(
      "collection-of-beauty/Dong_Yuan_Mountain_Hall.jpg",
      [...LADDER, 9361],
      12384,
      21675,
    );
    expect(src).not.toBeNull();
    expect(src?.width).toBe(9361);
    expect(src?.height).toBe(16384);
    expect(src?.tileSize).toBe(TILE_SIZE);
    expect(src?.tileOverlap).toBe(TILE_OVERLAP);
    expect(src?.minLevel).toBe(0);
    // dzsave halves the image each level up until a single 1x1 tile, so
    // the deepest index is ceil(log2(longest side)). This is the number
    // that has to agree with the directories on disk — a pyramid built
    // for 16384 px tops out at level 14.
    expect(src?.maxLevel).toBe(14);
  });

  it("builds tile URLs matching the <level>/<col>_<row>.webp layout on disk", () => {
    const src = deepZoomTileSource(
      "collection-of-beauty/Dong_Yuan_Mountain_Hall.jpg",
      [...LADDER, 9361],
      12384,
      21675,
    );
    expect(src?.getTileUrl(14, 0, 0)).toContain(
      "/collection-of-beauty/Dong_Yuan_Mountain_Hall/tiles/14/0_0.webp",
    );
    expect(src?.getTileUrl(9, 3, 7)).toContain(
      "/collection-of-beauty/Dong_Yuan_Mountain_Hall/tiles/9/3_7.webp",
    );
  });

  it("percent-encodes object keys with spaces and punctuation", () => {
    const src = deepZoomTileSource(
      "audubon-birds/5_Bonaparte's Flycatcher.jpg",
      [...LADDER, 11120],
      11120,
      8000,
    );
    // The apostrophe and space survive as escapes rather than splitting
    // the path — these filenames are real in the audubon-birds folder.
    expect(src?.getTileUrl(3, 1, 2)).toContain("Bonaparte's%20Flycatcher/tiles/3/1_2.webp");
  });
});

describe("largestSingleImageWidth", () => {
  it("is the manifest max for a work that stops at the ladder", () => {
    expect(largestSingleImageWidth(LADDER, 3000, 2000)).toBe(Math.max(...LADDER));
  });

  it("keeps the full-size rung for a work that has a pyramid", () => {
    // The lightbox and the 3D zoom modal both skip the eager fetch for
    // tiled works; this URL is only their fallback for a pyramid that
    // turns out not to be on the bucket, so it must stay the sharpest
    // copy that exists.
    expect(largestSingleImageWidth([...LADDER, 11120], 11120, 8000)).toBe(11120);
  });

  it("drops back to the ladder when the above-ladder rung has no pyramid", () => {
    // The Boilly conscrits: a 16384 px full-size encode, and null source
    // dimensions, so build-tiles skipped it and deepZoomSize returns
    // null. Without this the lightbox eagerly downloaded 15 MB for a
    // work with no deep-zoom path to skip the download for.
    expect(largestSingleImageWidth([...LADDER, 16384], null, null)).toBe(Math.max(...LADDER));
  });

  it("ignores the gallery LOD rung when falling back", () => {
    // GALLERY_LOD_WIDTH sits above the ladder but is not a download
    // target; with no pyramid to justify an above-ladder fetch the
    // fallback must be a ladder rung.
    expect(largestSingleImageWidth([...LADDER, GALLERY_LOD_WIDTH, 16384], null, null)).toBe(
      Math.max(...LADDER),
    );
  });

  it("returns null for an empty manifest", () => {
    expect(largestSingleImageWidth([], 100, 100)).toBeNull();
    expect(largestSingleImageWidth(null, 100, 100)).toBeNull();
  });
});
