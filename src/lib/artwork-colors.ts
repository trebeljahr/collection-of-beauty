import { COLOR_BUCKETS, type ColorBucketId } from "@/lib/color-buckets.mjs";
import { type ArtworkListing, artworkListings, artworks } from "@/lib/data";

export type ColorBucketCounts = Record<ColorBucketId, number>;

/** The minimum an entry needs for counting — keeps the pure function
 *  usable from tests without hand-building whole ArtworkListings. */
type ColorTagged = Pick<ArtworkListing, "colorBuckets">;

/** How many works list each colour family. A work with `["blue", "gold"]`
 *  counts once under blue and once under gold, matching the filter, which
 *  matches on membership rather than on the primary family — so these
 *  totals sum to more than the size of the collection. */
export function countColorBuckets(listings: readonly ColorTagged[]): ColorBucketCounts {
  const counts = Object.fromEntries(COLOR_BUCKETS.map((b) => [b.id, 0])) as ColorBucketCounts;
  for (const listing of listings) {
    if (!listing.colorBuckets) continue;
    // A malformed or duplicated array shouldn't inflate a bucket past the
    // number of works actually in it.
    for (const id of new Set(listing.colorBuckets)) {
      if (id in counts) counts[id] += 1;
    }
  }
  return counts;
}

let cached: ColorBucketCounts | null = null;

/** Counts across the whole collection. Module-scope cached: the walk is
 *  cheap but it runs on every colour page render and every home-page
 *  request, and the underlying JSON is baked at build time. */
export function allColorBucketCounts(): ColorBucketCounts {
  if (!cached) cached = countColorBuckets(artworkListings);
  return cached;
}

/** Works listing a given family, in the collection's default order.
 *  Shared by the `/colours/<family>` page and the `color` lightbox scope
 *  so the two walk the same sequence. */
export function listingsForColor(id: ColorBucketId): ArtworkListing[] {
  return artworkListings.filter((artwork) => artwork.colorBuckets?.includes(id) ?? false);
}

let strengthIndex: Map<string, Partial<Record<ColorBucketId, number>>> | null = null;

/** How much of `family` a work carries, 0-1, or 0 when it carries none.
 *
 *  Server-only by construction: the numbers live on the full `Artwork`
 *  rather than on `ArtworkListing`, so reading them here keeps them out
 *  of every gallery page's RSC payload. The index is built once per
 *  server instance — the source JSON is baked at build time, so there is
 *  nothing to invalidate.
 *
 *  This is the ordering signal for "the reddest works first". It is
 *  comparable between two works within one family and meaningless
 *  between families: `blue: 0.3` is not "more" than `gold: 0.5`, because
 *  the corpus is full of gold and short of blue. Cross-family comparison
 *  is what the prior-normalised score in color-buckets.mjs exists for,
 *  and that score is what decided membership in the first place. */
export function colorStrength(artworkId: string, family: ColorBucketId): number {
  if (!strengthIndex) {
    strengthIndex = new Map(artworks.map((a) => [a.id, a.colorStrength ?? {}]));
  }
  return strengthIndex.get(artworkId)?.[family] ?? 0;
}

/** Order a list so the works carrying most of `family` come first.
 *  Ties break on id so the sequence is stable across requests — the
 *  lightbox's prev/next walks this same array and must not disagree with
 *  the grid it was opened from. */
export function sortByColorStrength<T extends { id: string }>(
  listings: readonly T[],
  family: ColorBucketId,
): T[] {
  return [...listings].sort(
    (a, b) => colorStrength(b.id, family) - colorStrength(a.id, family) || a.id.localeCompare(b.id),
  );
}
