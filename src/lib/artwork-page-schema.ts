import type { ArtworkListing } from "@/lib/data";

/** "plate" only means anything alongside a `collection` filter — it
 *  orders by the printed plate number, which is a property of the plate
 *  set rather than of an artwork.
 *
 *  "color" is the same shape of thing for the `color` filter: it orders
 *  by how much of *that* family a work carries, so the reddest works
 *  head the red page. Without a colour filter there is no family to rank
 *  against and it falls through to the shuffle. */
export type ArtworkSort = "shuffle" | "year" | "artist" | "title" | "plate" | "color";

export type ArtworkPage = {
  items: ArtworkListing[];
  total: number;
  nextOffset: number | null;
  hasMore: boolean;
};

export const DEFAULT_ARTWORK_PAGE_SIZE = 80;
export const MAX_ARTWORK_PAGE_SIZE = 120;
export const DEFAULT_ARTWORK_SORT: ArtworkSort = "shuffle";
export const DEFAULT_SHUFFLE_SEED = "salon-2026";
