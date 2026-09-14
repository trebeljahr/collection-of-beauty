import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";
import { decadeOf, getTimelineDecadeWorks, getTimelineSummary } from "@/lib/timeline";

describe("decadeOf", () => {
  it("floors to the decade start", () => {
    expect(decadeOf(1873)).toBe(1870);
    expect(decadeOf(1870)).toBe(1870);
    expect(decadeOf(1879)).toBe(1870);
    expect(decadeOf(950)).toBe(950);
  });
});

describe("getTimelineSummary", () => {
  const summary = getTimelineSummary();

  it("counts every dated work exactly once", () => {
    const dated = new Set(artworkListings.filter((a) => a.year != null).map((a) => a.id));
    expect(summary.total).toBe(dated.size);
    const histogramTotal = summary.decades.reduce((sum, d) => sum + d.count, 0);
    expect(histogramTotal).toBe(summary.total);
  });

  it("returns decades in ascending order, all on decade boundaries", () => {
    const starts = summary.decades.map((d) => d.decade);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts.every((s) => s % 10 === 0)).toBe(true);
    expect(starts.every((s, i) => i === 0 || s !== starts[i - 1])).toBe(true);
  });

  it("never emits an empty column", () => {
    expect(summary.decades.every((d) => d.count > 0)).toBe(true);
  });

  it("narrows to the era filter, untagged works included", () => {
    const filtered = getTimelineSummary({ era: "gothic" });
    const expected = artworkListings.filter(
      (a) => a.year != null && assignEra(a) === "gothic",
    ).length;
    expect(filtered.total).toBe(expected);
    expect(filtered.total).toBeGreaterThan(0);
    expect(filtered.total).toBeLessThan(summary.total);
  });

  it("matches nothing for an unknown era id", () => {
    expect(getTimelineSummary({ era: "Impressionism" }).total).toBe(0);
  });

  it("narrows to the free-text filter and folds accents", () => {
    const withAccent = getTimelineSummary({ query: "Redoute" });
    expect(withAccent.total).toBeGreaterThan(0);
    expect(withAccent.total).toBe(getTimelineSummary({ query: "Redouté" }).total);
    expect(withAccent.total).toBeLessThan(summary.total);
  });

  it("treats a blank query as no filter", () => {
    expect(getTimelineSummary({ query: "   " }).total).toBe(summary.total);
  });

  it("returns an empty histogram when nothing matches", () => {
    const none = getTimelineSummary({ query: "zzzznotathing" });
    expect(none.total).toBe(0);
    expect(none.decades).toEqual([]);
  });
});

describe("getTimelineDecadeWorks", () => {
  it("returns exactly the works the histogram counted for that decade", () => {
    for (const { decade, count } of getTimelineSummary().decades) {
      const works = getTimelineDecadeWorks(decade);
      expect(works).toHaveLength(count);
      expect(works.every((w) => w.year != null && decadeOf(w.year) === decade)).toBe(true);
    }
  });

  it("orders by year, then title", () => {
    const works = getTimelineDecadeWorks(1880);
    const years = works.map((w) => w.year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it("ships only the fields a tile renders", () => {
    const [work] = getTimelineDecadeWorks(1880);
    expect(Object.keys(work).sort()).toEqual(
      [
        "artist",
        "artistSlug",
        "dominantColor",
        "englishTitle",
        "id",
        "objectKey",
        "title",
        "variantWidths",
        "year",
      ].sort(),
    );
  });

  it("applies the same filters as the histogram", () => {
    const filter = { query: "Redoute" };
    for (const { decade, count } of getTimelineSummary(filter).decades) {
      expect(getTimelineDecadeWorks(decade, filter)).toHaveLength(count);
    }
  });

  it("returns nothing for a decade outside the corpus", () => {
    expect(getTimelineDecadeWorks(2400)).toEqual([]);
  });
});
