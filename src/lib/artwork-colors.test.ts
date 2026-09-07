import { describe, expect, it } from "vitest";
import { allColorBucketCounts, countColorBuckets, listingsForColor } from "@/lib/artwork-colors";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { COLOR_BUCKETS, type ColorBucketId } from "@/lib/color-buckets.mjs";
import { artworkListings } from "@/lib/data";

describe("countColorBuckets", () => {
  it("starts every family at zero so callers never read undefined", () => {
    const counts = countColorBuckets([]);
    for (const bucket of COLOR_BUCKETS) expect(counts[bucket.id]).toBe(0);
  });

  it("counts a work once per family it lists", () => {
    const counts = countColorBuckets([
      { colorBuckets: ["blue", "gold"] },
      { colorBuckets: ["blue"] },
      { colorBuckets: ["green"] },
    ]);
    expect(counts.blue).toBe(2);
    expect(counts.gold).toBe(1);
    expect(counts.green).toBe(1);
    expect(counts.red).toBe(0);
  });

  it("skips unclassified works instead of counting them anywhere", () => {
    const counts = countColorBuckets([{ colorBuckets: null }, { colorBuckets: ["blue"] }]);
    expect(counts.blue).toBe(1);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(1);
  });

  it("does not let a duplicated entry inflate a bucket", () => {
    const counts = countColorBuckets([{ colorBuckets: ["blue", "blue"] }]);
    expect(counts.blue).toBe(1);
  });

  it("ignores ids that are not known families", () => {
    const counts = countColorBuckets([
      { colorBuckets: ["chartreuse" as ColorBucketId, "blue"] },
      { colorBuckets: ["blue"] },
    ]);
    expect(counts.blue).toBe(2);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(2);
  });
});

describe("the baked corpus", () => {
  it("classified every work", () => {
    const unclassified = artworkListings.filter((a) => a.colorBuckets == null);
    expect(unclassified).toHaveLength(0);
  });

  it("only ever bakes known family ids", () => {
    const known = new Set<string>(COLOR_BUCKETS.map((b) => b.id));
    const unknown = new Set<string>();
    for (const artwork of artworkListings) {
      for (const id of artwork.colorBuckets ?? []) if (!known.has(id)) unknown.add(id);
    }
    expect([...unknown]).toEqual([]);
  });

  it("leaves no family empty, so every swatch in the ring goes somewhere", () => {
    // The point of the prior normalisation: without it the warm families
    // swallow the corpus and several swatches lead to an empty grid.
    const counts = allColorBucketCounts();
    for (const bucket of COLOR_BUCKETS) {
      expect(counts[bucket.id], `${bucket.id} has no works`).toBeGreaterThan(0);
    }
  });

  it("keeps any single family well short of the whole collection", () => {
    const counts = allColorBucketCounts();
    for (const bucket of COLOR_BUCKETS) {
      expect(counts[bucket.id] / artworkListings.length).toBeLessThan(0.5);
    }
  });

  it("agrees with the filter it drives", () => {
    const counts = allColorBucketCounts();
    for (const bucket of COLOR_BUCKETS) {
      expect(listingsForColor(bucket.id)).toHaveLength(counts[bucket.id]);
    }
  });
});

describe("colour filtering in getArtworkListingPage", () => {
  it("returns only works listing the requested family", () => {
    const page = getArtworkListingPage({ color: "blue", limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) expect(item.colorBuckets).toContain("blue");
  });

  it("matches on membership, not just the primary family", () => {
    // A work whose blue is secondary must still surface under blue —
    // otherwise a seascape read as gold-then-blue disappears from the
    // blue swatch, which is the failure the filter exists to avoid.
    const secondary = artworkListings.filter((a) => (a.colorBuckets?.indexOf("blue") ?? -1) > 0);
    expect(secondary.length).toBeGreaterThan(0);
    const inFilter = new Set(listingsForColor("blue").map((a) => a.id));
    for (const work of secondary) expect(inFilter.has(work.id)).toBe(true);
  });

  it("reports the filtered total, not the collection total", () => {
    const page = getArtworkListingPage({ color: "teal", limit: 10 });
    expect(page.total).toBe(allColorBucketCounts().teal);
    expect(page.total).toBeLessThan(artworkListings.length);
  });

  it("treats an empty colour as no filter at all", () => {
    const unfiltered = getArtworkListingPage({ limit: 5 });
    expect(getArtworkListingPage({ color: "", limit: 5 }).total).toBe(unfiltered.total);
    expect(getArtworkListingPage({ color: null, limit: 5 }).total).toBe(unfiltered.total);
  });

  it("composes with the era filter rather than replacing it", () => {
    const colorOnly = getArtworkListingPage({ color: "blue", limit: 1 });
    const eraOnly = getArtworkListingPage({ era: "fin-de-siecle", limit: 1 });
    const both = getArtworkListingPage({ color: "blue", era: "fin-de-siecle", limit: 1 });
    expect(both.total).toBeLessThanOrEqual(colorOnly.total);
    expect(both.total).toBeLessThanOrEqual(eraOnly.total);
  });

  it("composes with the text query rather than replacing it", () => {
    const queryOnly = getArtworkListingPage({ query: "monet", limit: 1 });
    const both = getArtworkListingPage({ query: "monet", color: "green", limit: 100 });
    expect(both.total).toBeLessThanOrEqual(queryOnly.total);
    for (const item of both.items) expect(item.colorBuckets).toContain("green");
  });

  it("pages a filtered set without gaps or repeats", () => {
    const first = getArtworkListingPage({ color: "blue", limit: 40 });
    const second = getArtworkListingPage({
      color: "blue",
      offset: first.nextOffset ?? 0,
      limit: 40,
    });
    const ids = new Set([...first.items, ...second.items].map((a) => a.id));
    expect(ids.size).toBe(first.items.length + second.items.length);
    for (const item of second.items) expect(item.colorBuckets).toContain("blue");
  });
});
