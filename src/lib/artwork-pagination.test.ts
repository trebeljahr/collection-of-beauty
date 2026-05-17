import { describe, expect, it } from "vitest";
import { DEFAULT_ARTWORK_PAGE_SIZE, MAX_ARTWORK_PAGE_SIZE } from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";

describe("getArtworkListingPage", () => {
  it("returns stable non-overlapping pages", () => {
    const first = getArtworkListingPage({ limit: 20, seed: "test-seed" });
    const second = getArtworkListingPage({
      offset: first.nextOffset ?? 0,
      limit: 20,
      seed: "test-seed",
    });

    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(20);
    expect(new Set(first.items.map((item) => item.id)).size).toBe(first.items.length);
    expect(first.items.some((item) => second.items.some((next) => next.id === item.id))).toBe(
      false,
    );
  });

  it("filters before slicing", () => {
    const page = getArtworkListingPage({
      query: "monet",
      movement: "Impressionism",
      limit: 10,
    });

    expect(page.total).toBeGreaterThan(page.items.length);
    expect(page.items.every((item) => item.movement === "Impressionism")).toBe(true);
    expect(
      page.items.every((item) =>
        [item.title, item.artist, item.movement, item.nationality]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes("monet"),
      ),
    ).toBe(true);
  });

  it("matches accent-folded search terms", () => {
    const page = getArtworkListingPage({ query: "gerome", limit: 5 });

    expect(page.total).toBeGreaterThan(0);
    expect(page.items.some((item) => item.artist === "Jean-Léon Gérôme")).toBe(true);
  });

  it("spreads adjacent artists when shuffling", () => {
    const page = getArtworkListingPage({ limit: 100, seed: "spread-test" });
    let adjacentSameArtist = 0;
    for (let i = 1; i < page.items.length; i++) {
      const prev = page.items[i - 1].artist;
      const curr = page.items[i].artist;
      if (prev && curr && prev === curr) adjacentSameArtist += 1;
    }
    // Anti-cluster pass should keep adjacent same-artist count near zero
    // (only possible when a single artist's bucket exceeds the artist
    // count, which is far above 100 works for this collection).
    expect(adjacentSameArtist).toBe(0);
  });

  it("produces a different shuffle order for different seeds", () => {
    const a = getArtworkListingPage({ limit: 40, seed: "alpha" });
    const b = getArtworkListingPage({ limit: 40, seed: "beta" });
    const aIds = a.items.map((item) => item.id).join("|");
    const bIds = b.items.map((item) => item.id).join("|");
    expect(aIds).not.toBe(bIds);
  });

  it("caps large page requests", () => {
    const page = getArtworkListingPage({ limit: MAX_ARTWORK_PAGE_SIZE + 100 });

    expect(page.items).toHaveLength(MAX_ARTWORK_PAGE_SIZE);
    expect(getArtworkListingPage().items).toHaveLength(DEFAULT_ARTWORK_PAGE_SIZE);
  });
});
