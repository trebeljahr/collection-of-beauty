import { type ArtworkListing, artworkListings } from "@/lib/data";
import { surprisePool } from "@/lib/surprise";

/**
 * The filtered catalogue that `/surprise` and its refill endpoint draw
 * from, computed once per server process rather than on every request.
 *
 * Server-side only by convention — it closes over the full listing
 * array, which has no business being pulled into a client chunk. Kept
 * out of `@/lib/surprise` so the predicate there stays data-free and
 * cheap to unit test.
 */
export const SURPRISE_POOL: readonly ArtworkListing[] = surprisePool(artworkListings);
