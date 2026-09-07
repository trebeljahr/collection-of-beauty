import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import {
  isSurpriseWorthy,
  MAX_SURPRISE_ASPECT,
  MIN_SURPRISE_SOURCE_LONG_EDGE,
  MIN_SURPRISE_VARIANT_WIDTH,
  sampleDistinct,
  surpriseDeck,
  surprisePool,
} from "@/lib/surprise";

const LADDER = [256, 480, 640, 960, 1280, 1920, 2560, 4096];

function candidate(overrides: Partial<Parameters<typeof isSurpriseWorthy>[0]> = {}) {
  return { width: 2400, height: 3000, variantWidths: LADDER, ...overrides };
}

/** Deterministic stand-in for Math.random — cycles the given values. */
function stubRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("isSurpriseWorthy", () => {
  it("accepts a large, shrunk, sanely-proportioned work", () => {
    expect(isSurpriseWorthy(candidate())).toBe(true);
  });

  it("rejects works with no variant ladder", () => {
    expect(isSurpriseWorthy(candidate({ variantWidths: null }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ variantWidths: [] }))).toBe(false);
  });

  it("rejects a ladder that tops out below the large-render rung", () => {
    expect(isSurpriseWorthy(candidate({ variantWidths: [256, 480, 640, 960] }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ variantWidths: [MIN_SURPRISE_VARIANT_WIDTH] }))).toBe(true);
  });

  it("rejects unknown or nonsensical source dimensions", () => {
    expect(isSurpriseWorthy(candidate({ width: null }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ height: null }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ width: 0, height: 0 }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ width: -2400 }))).toBe(false);
  });

  it("rejects sources too small to fill a viewport, whichever edge is long", () => {
    const under = MIN_SURPRISE_SOURCE_LONG_EDGE - 1;
    expect(isSurpriseWorthy(candidate({ width: 900, height: under }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ width: under, height: 900 }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ width: 900, height: MIN_SURPRISE_SOURCE_LONG_EDGE }))).toBe(
      true,
    );
  });

  it("rejects slivers in both orientations, at the boundary inclusive", () => {
    const long = 2000 * MAX_SURPRISE_ASPECT;
    expect(isSurpriseWorthy(candidate({ width: long, height: 2000 }))).toBe(true);
    expect(isSurpriseWorthy(candidate({ width: long + 400, height: 2000 }))).toBe(false);
    expect(isSurpriseWorthy(candidate({ width: 2000, height: long + 400 }))).toBe(false);
  });
});

describe("surprisePool", () => {
  it("keeps only the worthy entries", () => {
    const good = candidate();
    const tiny = candidate({ width: 400, height: 500 });
    expect(surprisePool([good, tiny, good])).toEqual([good, good]);
  });

  it("falls back to the whole pool when nothing qualifies", () => {
    const unshrunk = [candidate({ variantWidths: null }), candidate({ variantWidths: [] })];
    expect(surprisePool(unshrunk)).toEqual(unshrunk);
  });

  it("returns an empty pool unchanged", () => {
    expect(surprisePool([])).toEqual([]);
  });
});

describe("sampleDistinct", () => {
  const pool = ["a", "b", "c", "d", "e"];

  it("returns distinct items", () => {
    const picked = sampleDistinct(pool, 5, stubRandom([0.9, 0.1, 0.7, 0.3, 0.5]));
    expect(new Set(picked).size).toBe(5);
    expect([...picked].sort()).toEqual([...pool].sort());
  });

  it("is deterministic for a given random source", () => {
    const seed = [0.42, 0.17, 0.83, 0.05, 0.61];
    expect(sampleDistinct(pool, 3, stubRandom(seed))).toEqual(
      sampleDistinct(pool, 3, stubRandom(seed)),
    );
  });

  it("clamps count to the pool size and to zero", () => {
    expect(sampleDistinct(pool, 99, stubRandom([0.5])).length).toBe(pool.length);
    expect(sampleDistinct(pool, 0, stubRandom([0.5]))).toEqual([]);
    expect(sampleDistinct(pool, -3, stubRandom([0.5]))).toEqual([]);
    expect(sampleDistinct([], 4, stubRandom([0.5]))).toEqual([]);
  });

  it("never indexes out of bounds for a badly-behaved random source", () => {
    for (const value of [1, 1.5, -0.2, Number.NaN]) {
      const picked = sampleDistinct(pool, pool.length, stubRandom([value]));
      expect(picked).toHaveLength(pool.length);
      expect(picked.every((item) => pool.includes(item))).toBe(true);
    }
  });
});

describe("surpriseDeck", () => {
  it("draws only from the worthy entries", () => {
    const good = candidate({ width: 3000, height: 2400 });
    const pool = [candidate({ variantWidths: null }), good, candidate({ width: 300, height: 400 })];
    expect(surpriseDeck(pool, 3, stubRandom([0.1, 0.9, 0.5]))).toEqual([good]);
  });
});

describe("the real catalogue", () => {
  it("has a large pool of works worth showing full bleed", () => {
    const pool = surprisePool(artworkListings);
    expect(pool.length).toBeGreaterThan(1000);
    expect(pool.length).toBeLessThan(artworkListings.length);
    expect(pool.every(isSurpriseWorthy)).toBe(true);
  });

  it("hands back a full deck of distinct works", () => {
    const deck = surpriseDeck(artworkListings, 8);
    expect(deck).toHaveLength(8);
    expect(new Set(deck.map((a) => a.id)).size).toBe(8);
  });
});
