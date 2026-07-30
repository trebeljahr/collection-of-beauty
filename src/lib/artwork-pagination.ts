import {
  type ArtworkPage,
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_ARTWORK_SORT,
  DEFAULT_SHUFFLE_SEED,
  MAX_ARTWORK_PAGE_SIZE,
} from "@/lib/artwork-page-schema";
import { type ArtworkListing, artworkListings } from "@/lib/data";
import { assignEra, type EraId } from "@/lib/gallery-eras";
import { PINNED_FIRST_PAGE_IDS } from "@/lib/pinned-first-page";

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
};

let cachedDefaultGalleryOrder: ArtworkListing[] | null = null;

/** Full collection in the home page's default display order:
 *  shuffle-with-artist-spread (default seed) + pinned head. Used by the
 *  `gallery` scope so prev/next on the artwork detail page walks the
 *  same sequence visible on the home grid. The order is deterministic
 *  given the default seed and pinned ids, so a module-scope cache pays
 *  the ~2,950-item sort exactly once per server instance. */
export function getAllListingsInDefaultOrder(): ArtworkListing[] {
  if (cachedDefaultGalleryOrder) return cachedDefaultGalleryOrder;
  const sorted = sortArtworkListings(artworkListings, DEFAULT_ARTWORK_SORT, DEFAULT_SHUFFLE_SEED);
  cachedDefaultGalleryOrder = applyPinnedHead(sorted, PINNED_FIRST_PAGE_IDS);
  return cachedDefaultGalleryOrder;
}

export function getArtworkListingPage(input: ArtworkPageInput = {}): ArtworkPage {
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const limit = clampLimit(input.limit);
  const sort = input.sort ?? DEFAULT_ARTWORK_SORT;
  const seed = input.seed || DEFAULT_SHUFFLE_SEED;
  const query = normalizeQuery(input.query);

  let list = artworkListings;

  if (query) list = list.filter((artwork) => matchesQuery(artwork, query));
  if (input.era) list = list.filter((artwork) => assignEra(artwork) === input.era);
  if (input.artistSlug) {
    list = list.filter((artwork) => artwork.artistSlug === input.artistSlug);
  }

  const sorted = sortArtworkListings(list, sort, seed);
  const ordered =
    sort === "shuffle" &&
    seed === DEFAULT_SHUFFLE_SEED &&
    query.length === 0 &&
    !input.era &&
    !input.artistSlug
      ? applyPinnedHead(sorted, PINNED_FIRST_PAGE_IDS)
      : sorted;
  const items = ordered.slice(offset, offset + limit);
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
      (a, b) => (a.artist ?? "￿").localeCompare(b.artist ?? "￿") || a.title.localeCompare(b.title),
    );
  }
  if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title));

  return shuffleWithArtistSpread(list, seed);
}

/** Deterministic shuffle that spreads each artist's works evenly across
 *  the whole sequence. Work i of an n-work bucket lands near fractional
 *  position (i + phase)/n, so every artist is dealt at a stride
 *  proportional to their share of the pool. Round-robin dealing (the
 *  previous approach) alternated artists only until the smaller buckets
 *  ran dry, leaving a long single-artist tail — on the natural-history
 *  era that read as 300+ consecutive Audubon plates. Exported so
 *  resolveScope can mirror the era page's order exactly. */
export function shuffleWithArtistSpread(
  artworks: ArtworkListing[],
  seed: string,
): ArtworkListing[] {
  const buckets = new Map<string, ArtworkListing[]>();
  for (const artwork of artworks) {
    const key = artwork.artist ?? `__unknown__:${artwork.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(artwork);
    else buckets.set(key, [artwork]);
  }

  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) => seededScore(a.id, seed) - seededScore(b.id, seed) || a.id.localeCompare(b.id),
    );
  }

  const keyed: Array<{ artwork: ArtworkListing; at: number }> = [];
  for (const [artist, bucket] of buckets) {
    // Seeded phase in [0,1) so buckets don't all start at position 0.
    const phase = seededScore(artist, `${seed}\0artist`) / 0x1_0000_0000;
    for (let i = 0; i < bucket.length; i++) {
      keyed.push({ artwork: bucket[i], at: (i + phase) / bucket.length });
    }
  }
  keyed.sort((a, b) => a.at - b.at || a.artwork.id.localeCompare(b.artwork.id));
  return keyed.map((k) => k.artwork);
}

function applyPinnedHead(sorted: ArtworkListing[], pinnedIds: readonly string[]): ArtworkListing[] {
  const byId = new Map(sorted.map((artwork) => [artwork.id, artwork]));
  const pinnedSet = new Set(pinnedIds);
  const head: ArtworkListing[] = [];
  for (const id of pinnedIds) {
    const found = byId.get(id);
    if (found) head.push(found);
  }
  const tail = sorted.filter((artwork) => !pinnedSet.has(artwork.id));
  return [...head, ...tail];
}

function normalizeQuery(query: string | undefined): string[] {
  return foldText(query ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function matchesQuery(artwork: ArtworkListing, terms: string[]): boolean {
  const haystack = foldText(
    [artwork.title, artwork.englishTitle, artwork.artist, artwork.movement, artwork.nationality]
      .filter(Boolean)
      .join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

function foldText(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
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
