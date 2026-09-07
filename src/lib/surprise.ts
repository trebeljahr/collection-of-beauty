/**
 * Candidate selection for `/surprise` — the "just show me something
 * beautiful" entry point that drops a visitor onto one random work
 * rendered full bleed.
 *
 * Kept free of any `@/lib/data` import so it stays a pure, cheaply
 * testable module: callers hand in the pool. The server routes memoise
 * the filtered pool at module scope (see `@/lib/surprise-pool`).
 */

/** The subset of `ArtworkListing` the picker actually reasons about.
 *  Structural so a test can pass a two-field literal. */
export type SurpriseCandidate = {
  width: number | null;
  height: number | null;
  variantWidths: readonly number[] | null;
};

/** A work has to have at least one pre-built variant this wide to be
 *  worth showing full bleed — anything below it is a thumbnail ladder
 *  and the hero would be visibly soft on a laptop. Matches
 *  FALLBACK_VARIANT_WIDTH, the rung every shrunk artwork carries. */
export const MIN_SURPRISE_VARIANT_WIDTH = 1280;

/** Minimum long edge of the *source* scan. `shrink-sources.mjs` emits
 *  the full ladder regardless of source size (a 450×672 scan still gets
 *  a 4096.avif), so `variantWidths` alone says nothing about how much
 *  real detail exists — the source dimensions do. 1600 px is roughly
 *  "fills a 13-inch laptop without upscaling". */
export const MIN_SURPRISE_SOURCE_LONG_EDGE = 1600;

/** Reject extreme panoramas and scroll paintings. At 6:1 the frame is a
 *  letterbox sliver once it's height-capped to the viewport, which is
 *  the opposite of "looks good big". ~18 works in the corpus exceed 4:1. */
export const MAX_SURPRISE_ASPECT = 4;

/**
 * Is this work worth showing as a full-bleed hero? Pure predicate over
 * the three signals the catalogue actually carries: a usable variant
 * ladder, a source big enough to fill a viewport, and an aspect ratio
 * that isn't a sliver.
 */
export function isSurpriseWorthy(art: SurpriseCandidate): boolean {
  const widths = art.variantWidths;
  if (!widths || widths.length === 0) return false;
  if (!widths.some((w) => w >= MIN_SURPRISE_VARIANT_WIDTH)) return false;

  const { width, height } = art;
  if (!width || !height || width <= 0 || height <= 0) return false;
  if (Math.max(width, height) < MIN_SURPRISE_SOURCE_LONG_EDGE) return false;

  const aspect = Math.max(width / height, height / width);
  return aspect <= MAX_SURPRISE_ASPECT;
}

/**
 * The pool to draw from: everything that passes `isSurpriseWorthy`, or
 * the untouched input when nothing does. The fallback matters because
 * the predicate leans on `variantWidths`, which is `null` for freshly
 * ingested works — a catalogue that hasn't been through `assets:shrink`
 * yet should still yield a random work rather than a blank page.
 */
export function surprisePool<T extends SurpriseCandidate>(pool: readonly T[]): readonly T[] {
  const worthy = pool.filter(isSurpriseWorthy);
  return worthy.length > 0 ? worthy : pool;
}

/**
 * `count` distinct items drawn uniformly at random, via a partial
 * Fisher-Yates over an index array. Distinctness is the point: the deck
 * is handed to the client so "again" is a state swap rather than a
 * round trip, and a repeat inside one deck reads as a broken button.
 */
export function sampleDistinct<T>(
  pool: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const take = Math.min(Math.max(Math.trunc(count), 0), pool.length);
  if (take === 0) return [];

  const idx = Array.from({ length: pool.length }, (_, i) => i);
  const out: T[] = [];
  for (let i = 0; i < take; i++) {
    const j = i + boundedIndex(random, pool.length - i);
    const swap = idx[j];
    idx[j] = idx[i];
    idx[i] = swap;
    out.push(pool[idx[i]]);
  }
  return out;
}

/** Convenience composition of the two above. */
export function surpriseDeck<T extends SurpriseCandidate>(
  pool: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  return sampleDistinct(surprisePool(pool), count, random);
}

/** How many works the page ships to the client up front. Enough taps to
 *  feel bottomless before the first refill request, small enough that
 *  the RSC payload stays a couple of KB of slim listings. */
export const SURPRISE_DECK_SIZE = 8;

/** Upper bound on `?count=` at the refill endpoint, so a crafted query
 *  can't ask the server to serialise the whole catalogue. */
export const MAX_SURPRISE_DECK_SIZE = 24;

/** `Math.floor(random() * span)` clamped into `[0, span)`. A supplied
 *  `random` (seeded generator in tests, a stub) isn't guaranteed to
 *  stay under 1, and one out-of-range index would hand back
 *  `undefined` as if it were an artwork. */
function boundedIndex(random: () => number, span: number): number {
  const raw = Math.floor(random() * span);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, span - 1);
}
