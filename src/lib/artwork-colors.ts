import { COLOR_BUCKETS, type ColorBucketId } from "@/lib/color-buckets.mjs";
import { type ArtworkListing, artworkListings } from "@/lib/data";

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
