import type { ArtworkListing } from "@/lib/data";

export type ArtworkSort = "shuffle" | "year" | "artist" | "title";

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
