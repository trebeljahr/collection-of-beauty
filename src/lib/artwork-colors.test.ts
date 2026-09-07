import { describe, expect, it } from "vitest";
import {
  allColorBucketCounts,
  colorStrength,
  countColorBuckets,
  listingsForColor,
  sortByColorStrength,
} from "@/lib/artwork-colors";
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

describe("colorStrength over the baked corpus", () => {
  it("gives every work a strength for each family it lists", () => {
    // The sort is only as good as its coverage: a family baked without a
    // strength sorts as 0 and sinks to the bottom regardless of how much
    // of that colour the work actually carries.
    const missing = artworkListings.filter((a) =>
      (a.colorBuckets ?? []).some((id) => colorStrength(a.id, id) <= 0),
    );
    expect(missing.map((a) => a.id)).toEqual([]);
  });

  it("reports zero for a family the work does not list", () => {
    const work = artworkListings.find((a) => !a.colorBuckets?.includes("teal"));
    expect(work).toBeDefined();
    expect(colorStrength(work?.id ?? "", "teal")).toBe(0);
  });

  it("reports zero for an id that isn't in the collection", () => {
    expect(colorStrength("no-such-artwork", "red")).toBe(0);
  });

  it("keeps every baked strength inside 0-1", () => {
    for (const artwork of artworkListings) {
      for (const id of artwork.colorBuckets ?? []) {
        const value = colorStrength(artwork.id, id);
        expect(value, `${artwork.id}/${id}`).toBeGreaterThan(0);
        expect(value, `${artwork.id}/${id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("spreads a family across a real range rather than one flat value", () => {
    // If every red work scored the same, ranking by amount would be a
    // no-op and the page would be back to arbitrary order.
    const values = listingsForColor("red").map((a) => colorStrength(a.id, "red"));
    expect(values.length).toBeGreaterThan(10);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.1);
  });
});

describe("sortByColorStrength", () => {
  it("puts the works carrying most of the family first", () => {
    const sorted = sortByColorStrength(listingsForColor("red"), "red");
    for (let i = 1; i < sorted.length; i++) {
      expect(colorStrength(sorted[i - 1].id, "red")).toBeGreaterThanOrEqual(
        colorStrength(sorted[i].id, "red"),
      );
    }
  });

  it("is stable across calls, so the grid and the lightbox agree", () => {
    const a = sortByColorStrength(listingsForColor("blue"), "blue").map((x) => x.id);
    const b = sortByColorStrength([...listingsForColor("blue")].reverse(), "blue").map((x) => x.id);
    expect(a).toEqual(b);
  });

  it("does not drop or duplicate anything", () => {
    const input = listingsForColor("green");
    const sorted = sortByColorStrength(input, "green");
    expect(sorted).toHaveLength(input.length);
    expect(new Set(sorted.map((a) => a.id)).size).toBe(input.length);
  });

  it("leaves the input array untouched", () => {
    const input = listingsForColor("teal");
    const before = input.map((a) => a.id);
    sortByColorStrength(input, "teal");
    expect(input.map((a) => a.id)).toEqual(before);
  });
});

describe("sort=color in getArtworkListingPage", () => {
  it("opens a family with its strongest works", () => {
    const page = getArtworkListingPage({ color: "red", sort: "color", limit: 20 });
    const head = page.items.map((a) => colorStrength(a.id, "red"));
    const all = listingsForColor("red")
      .map((a) => colorStrength(a.id, "red"))
      .sort((x, y) => y - x);
    expect(head).toEqual(all.slice(0, head.length));
  });

  it("beats the shuffle on how red the first screen actually is", () => {
    // The complaint this whole sort answers: a shuffled red page opens
    // with works that merely have a red accent.
    const mean = (sort: "color" | "shuffle") => {
      const items = getArtworkListingPage({ color: "red", sort, limit: 40 }).items;
      return items.reduce((sum, a) => sum + colorStrength(a.id, "red"), 0) / items.length;
    };
    expect(mean("color")).toBeGreaterThan(mean("shuffle"));
  });

  it("pages a ranked family without gaps or repeats", () => {
    const first = getArtworkListingPage({ color: "blue", sort: "color", limit: 40 });
    const second = getArtworkListingPage({
      color: "blue",
      sort: "color",
      offset: first.nextOffset ?? 0,
      limit: 40,
    });
    const ids = [...first.items, ...second.items].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const weakestOfFirst = colorStrength(first.items[first.items.length - 1].id, "blue");
    expect(colorStrength(second.items[0].id, "blue")).toBeLessThanOrEqual(weakestOfFirst);
  });

  it("falls back to the shuffle when no family was named", () => {
    // Nothing to rank against — ordering by a colour nobody asked for
    // would be arbitrary, so this must match the default page exactly.
    const ranked = getArtworkListingPage({ sort: "color", limit: 20 });
    const shuffled = getArtworkListingPage({ sort: "shuffle", limit: 20 });
    expect(ranked.items.map((a) => a.id)).toEqual(shuffled.items.map((a) => a.id));
  });

  it("still filters to the family it ranks", () => {
    const page = getArtworkListingPage({ color: "purple", sort: "color", limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) expect(item.colorBuckets).toContain("purple");
  });
});
