import { describe, expect, it } from "vitest";
import { deepZoomTileSource } from "./deep-zoom";
import { deepZoomSize, TILE_OVERLAP, TILE_SIZE } from "./deep-zoom-config.mjs";

// The standard ladder every shrunk work has, plus (where applicable) the
// per-source full-resolution rung that marks a work as tiled.
const LADDER = [256, 480, 640, 960, 1280, 1920, 2560, 4096];

describe("deepZoomSize", () => {
  it("returns null for works that never exceeded the standard ladder", () => {
    expect(deepZoomSize(LADDER, 4096, 3000)).toBeNull();
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
