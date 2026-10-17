import { sortByColorStrength } from "@/lib/artwork-colors";
import {
  clampLimit,
  computeOrder,
  normalizeOrderInput,
  type OrderCorpus,
} from "@/lib/artwork-order";
import type { ArtworkPage, ArtworkSort } from "@/lib/artwork-page-schema";
import type { ColorBucketId } from "@/lib/color-buckets.mjs";
import { type ArtworkListing, artworkListings } from "@/lib/data";
import type { EraId } from "@/lib/gallery-eras";
import { plateSetListings } from "@/lib/plate-sets";

export { listingMatchesQuery } from "@/lib/artwork-order";

/** The catalogue as the ordering code sees it on the server. */
export const serverOrderCorpus: OrderCorpus = {
  listings: artworkListings,
  plateSet: plateSetListings,
  byColorStrength: sortByColorStrength,
};

export type ArtworkPageInput = {
  offset?: number;
  limit?: number;
  sort?: ArtworkSort;
  seed?: string;
  query?: string;
  era?: EraId | "" | null;
  /** Artist slug filter. Lets the artist page reuse the same paginated
   *  endpoint instead of shipping the full per-artist works array via
   *  RSC payload — matters most for high-output artists (Audubon ≈435
   *  works, Monet ≈368). */
  artistSlug?: string | null;
  /** Plate-set id. Unlike the other filters this also fixes the
   *  ordering: a plate set is a book, and the only ordering that means
   *  anything is the order the book prints. Combined with sort="plate"
   *  it reproduces exactly what /collection/<id> server-rendered, so
   *  load-more batches stitch onto the first page instead of repeating
   *  or skipping plates. */
  collection?: string | null;
  /** Colour-family filter. Matches a work when the family appears
   *  anywhere in its `colorBuckets`, not just at the head — a seascape
   *  that reads blue-then-gold should surface under both swatches.
   *
   *  Membership is deliberately generous, which is why sort="color"
   *  exists: a work needs only a visible margin above the corpus average
   *  to be tagged red, so the red page's tail is works with a red accent
   *  rather than red works. Ranking by amount puts that tail where it
   *  belongs instead of scattering it through the first screen. */
  color?: ColorBucketId | "" | null;
};

/** The ordering half of `ArtworkPageInput`: everything except the
 *  window into the result. */
export type ArtworkOrderInput = Omit<ArtworkPageInput, "offset" | "limit">;

/** Full collection in the home page's default display order:
 *  shuffle-with-artist-spread (default seed) + pinned head. Used by the
 *  `gallery` scope so prev/next on the artwork detail page walks the
 *  same sequence visible on the home grid. */
export function getAllListingsInDefaultOrder(): ArtworkListing[] {
  return orderedArtworkListings();
}

export function getArtworkListingPage(input: ArtworkPageInput = {}): ArtworkPage {
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const limit = clampLimit(input.limit);
  const ordered = orderedArtworkListings(input);
  const items = ordered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    total: ordered.length,
    nextOffset: nextOffset < ordered.length ? nextOffset : null,
    hasMore: nextOffset < ordered.length,
  };
}

/** Recently ordered lists, keyed by their normalised input. Every page
 *  of a gallery is a slice of one of these, and so is the sequence the
 *  artwork page's prev/next walks, so a visitor scrolling a search and
 *  then stepping through it pays for the filter, sort and ranking once.
 *  The query is caller input, so the key space is capped; a Map keeps
 *  insertion order, which makes the oldest key the first one. */
const orderCache = new Map<string, ArtworkListing[]>();
const ORDER_CACHE_CAP = 64;

/** The whole sequence a gallery surface displays for these filters, in
 *  display order. `getArtworkListingPage` is a window into it and
 *  `resolveScope` returns it outright — one function, so the order the
 *  grid shows and the order prev/next walks cannot drift apart.
 *
 *  The returned array is shared through the cache: callers must not
 *  mutate it. */
export function orderedArtworkListings(input: ArtworkOrderInput = {}): ArtworkListing[] {
  const normalized = normalizeOrderInput(input);
  const key = JSON.stringify(normalized);
  const hit = orderCache.get(key);
  if (hit) {
    // Re-insert so a busy key is the last to be evicted.
    orderCache.delete(key);
    orderCache.set(key, hit);
    return hit;
  }
  const ordered = computeOrder(normalized, serverOrderCorpus);
  orderCache.set(key, ordered);
  if (orderCache.size > ORDER_CACHE_CAP) {
    const oldest = orderCache.keys().next().value;
    if (oldest !== undefined) orderCache.delete(oldest);
  }
  return ordered;
}
