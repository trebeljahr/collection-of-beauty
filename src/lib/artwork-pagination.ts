import {
  type ArtworkPage,
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_ARTWORK_SORT,
  DEFAULT_SHUFFLE_SEED,
  MAX_ARTWORK_PAGE_SIZE,
} from "@/lib/artwork-page-schema";
import { type ArtworkListing, artworkListings } from "@/lib/data";

export type ArtworkPageInput = {
  offset?: number;
  limit?: number;
  sort?: ArtworkSort;
  seed?: string;
  query?: string;
  movement?: string;
  minYear?: number | null;
  maxYear?: number | null;
};

export function getArtworkListingPage(input: ArtworkPageInput = {}): ArtworkPage {
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const limit = clampLimit(input.limit);
  const sort = input.sort ?? DEFAULT_ARTWORK_SORT;
  const seed = input.seed || DEFAULT_SHUFFLE_SEED;
  const query = normalizeQuery(input.query);

  let list = artworkListings;

  if (query) list = list.filter((artwork) => matchesQuery(artwork, query));
  if (input.movement) list = list.filter((artwork) => artwork.movement === input.movement);
  const minYear = input.minYear;
  const maxYear = input.maxYear;
  if (minYear != null) {
    list = list.filter((artwork) => artwork.year != null && artwork.year >= minYear);
  }
  if (maxYear != null) {
    list = list.filter((artwork) => artwork.year != null && artwork.year <= maxYear);
  }

  const sorted = sortArtworkListings(list, sort, seed);
  const items = sorted.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    total: sorted.length,
    nextOffset: nextOffset < sorted.length ? nextOffset : null,
    hasMore: nextOffset < sorted.length,
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_ARTWORK_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_ARTWORK_PAGE_SIZE, Math.trunc(limit)));
}

function sortArtworkListings(
  artworks: readonly ArtworkListing[],
  sort: ArtworkSort,
  seed: string,
): ArtworkListing[] {
  const list = [...artworks];
  if (sort === "year") {
    return list.sort(
      (a, b) =>
        (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title),
    );
  }
  if (sort === "artist") {
    return list.sort(
      (a, b) =>
        (a.artist ?? "\uffff").localeCompare(b.artist ?? "\uffff") ||
        a.title.localeCompare(b.title),
    );
  }
  if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title));

  return list.sort(
    (a, b) => seededScore(a.id, seed) - seededScore(b.id, seed) || a.id.localeCompare(b.id),
  );
}

function normalizeQuery(query: string | undefined): string[] {
  return foldText(query ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function matchesQuery(artwork: ArtworkListing, terms: string[]): boolean {
  const haystack = foldText(
    [artwork.title, artwork.artist, artwork.movement, artwork.nationality]
      .filter(Boolean)
      .join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

function foldText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function seededScore(id: string, seed: string): number {
  let hash = 2166136261;
  const value = `${seed}\0${id}`;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
