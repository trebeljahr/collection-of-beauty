import { describe, expect, it } from "vitest";
import { resolveScope } from "@/lib/artwork-scope";
import { COLOR_BUCKETS } from "@/lib/color-buckets.mjs";
import {
  colorFamilyStrips,
  pickColorStrip,
  STRIP_MAX_ASPECT,
  STRIP_MIN_ASPECT,
  stripCount,
} from "@/lib/color-strips";
import type { ArtworkListing } from "@/lib/data";

function work(id: string, artist: string | null, width = 800, height = 1000): ArtworkListing {
  return {
    id,
    title: id,
    englishTitle: null,
    artist,
    artistSlug: artist ?? "",
    year: null,
    movement: null,
    nationality: null,
    objectKey: `test/${id}.jpg`,
    variantWidths: [256, 480],
    width,
    height,
    realDimensions: null,
    dominantColor: null,
    thumbHash: null,
    colorBuckets: ["red"],
  } as ArtworkListing;
}

describe("pickColorStrip", () => {
  it("keeps the family's order", () => {
    const ordered = [work("a", "A"), work("b", "B"), work("c", "C")];
    expect(pickColorStrip(ordered, new Set()).map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("takes one work per artist and counts anonymous works separately", () => {
    const ordered = [work("a1", "A"), work("a2", "A"), work("x", null), work("y", null)];
    expect(pickColorStrip(ordered, new Set()).map((w) => w.id)).toEqual(["a1", "x", "y"]);
  });

  it("skips works an earlier family already showed", () => {
    const ordered = [work("a", "A"), work("b", "B")];
    expect(pickColorStrip(ordered, new Set(["a"])).map((w) => w.id)).toEqual(["b"]);
  });

  it("skips works outside the aspect band and works without a size", () => {
    const ordered = [
      work("panorama", "A", 6500, 1000),
      work("sliver", "B", 300, 1000),
      work("unsized", "C", 0, 0),
      work("ok", "D"),
    ];
    expect(pickColorStrip(ordered, new Set()).map((w) => w.id)).toEqual(["ok"]);
  });

  it("stops at the limit", () => {
    const ordered = Array.from({ length: 20 }, (_, i) => work(`w${i}`, `artist${i}`));
    expect(pickColorStrip(ordered, new Set(), 5)).toHaveLength(5);
  });
});

describe("stripCount", () => {
  const frame = { width: 1000, height: 200, gap: 0 };

  it("picks the count whose row height is closest to the target", () => {
    // Square works: n of them in 1000 px make a row 1000/n tall.
    const squares = Array.from({ length: 10 }, (_, i) => work(`s${i}`, null, 100, 100));
    expect(stripCount(squares, frame)).toBe(5);
  });

  it("shows fewer works when they are wide", () => {
    const wide = Array.from({ length: 10 }, (_, i) => work(`w${i}`, null, 200, 100));
    const tall = Array.from({ length: 10 }, (_, i) => work(`t${i}`, null, 50, 100));
    expect(stripCount(wide, frame)).toBeLessThan(stripCount(tall, frame));
  });

  it("counts the gaps against the width", () => {
    const squares = Array.from({ length: 10 }, (_, i) => work(`s${i}`, null, 100, 100));
    expect(stripCount(squares, { ...frame, gap: 100 })).toBeLessThan(5);
  });

  it("returns what there is when the list is short", () => {
    expect(stripCount([work("a", null)], frame)).toBe(1);
    expect(stripCount([], frame)).toBe(0);
  });
});

describe("colorFamilyStrips", () => {
  const strips = colorFamilyStrips();

  it("has a strip for every family, in ring order", () => {
    expect(strips.map((s) => s.bucket.id)).toEqual(COLOR_BUCKETS.map((b) => b.id));
    for (const { works } of strips) expect(works.length).toBeGreaterThan(0);
  });

  it("never shows a work twice", () => {
    const ids = strips.flatMap((s) => s.works.map((w) => w.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("follows the family page's order", () => {
    for (const { bucket, works } of strips) {
      const order = resolveScope({ kind: "color", id: bucket.id }).map((w) => w.id);
      const positions = works.map((w) => order.indexOf(w.id));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("only hangs works inside the aspect band", () => {
    for (const { works } of strips) {
      for (const w of works) {
        const aspect = (w.width ?? 0) / (w.height ?? 1);
        expect(aspect).toBeGreaterThanOrEqual(STRIP_MIN_ASPECT);
        expect(aspect).toBeLessThanOrEqual(STRIP_MAX_ASPECT);
      }
    }
  });
});
