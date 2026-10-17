import Fuse from "fuse.js";
import {
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_ARTWORK_SORT,
  DEFAULT_SHUFFLE_SEED,
  MAX_ARTWORK_PAGE_SIZE,
} from "@/lib/artwork-page-schema";
import type { ColorBucketId } from "@/lib/color-buckets.mjs";
import type { ArtworkListing } from "@/lib/data";
import { assignEra, type EraId } from "@/lib/gallery-eras";
import { PINNED_FIRST_PAGE_IDS } from "@/lib/pinned-first-page";

// The ordering every gallery surface pages through, as pure functions of
// a corpus. The server binds it to the catalogue (artwork-pagination.ts);
// the browser binds it to the static JSON the export ships
// (static-data/client.ts) when a search asks for an order that was not
// prebuilt. Nothing here may import the catalogue: this module reaches
// client chunks.

/** What an ordering needs beyond the listings themselves. */
export type OrderCorpus = {
  listings: readonly ArtworkListing[];
  /** A plate set's works in the order the book prints them. */
  plateSet(id: string): readonly ArtworkListing[];
  /** `list` with the works carrying most of `family` first, ties by id. */
  byColorStrength(list: readonly ArtworkListing[], family: ColorBucketId): ArtworkListing[];
};

export type ArtworkOrderFields = {
  sort?: ArtworkSort;
  seed?: string;
  query?: string;
  era?: EraId | "" | null;
  artistSlug?: string | null;
  collection?: string | null;
  color?: ColorBucketId | "" | null;
};

const MAX_QUERY_LENGTH = 200;
const MAX_SEED_LENGTH = 100;

export type NormalizedOrderInput = {
  sort: ArtworkSort;
  seed: string;
  query: string;
  era: EraId | "";
  artistSlug: string;
  collection: string;
  color: ColorBucketId | "";
};

export function normalizeOrderInput(input: ArtworkOrderFields): NormalizedOrderInput {
  const requestedSort = input.sort ?? DEFAULT_ARTWORK_SORT;
  // "color" ranks by how much of a family a work carries, so without a
  // family it isn't a weaker version of itself — it *is* the default
  // shuffle, pinned head and all. Normalising here rather than only
  // inside the sort keeps `?sort=color` with no `color=` from returning
  // a subtly different home page than `?sort=shuffle`.
  const sort = requestedSort === "color" && !input.color ? DEFAULT_ARTWORK_SORT : requestedSort;
  return {
    sort,
    seed: (input.seed || DEFAULT_SHUFFLE_SEED).slice(0, MAX_SEED_LENGTH),
    query: (input.query ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    era: input.era || "",
    artistSlug: input.artistSlug || "",
    collection: input.collection || "",
    color: input.color || "",
  };
}

export function computeOrder(input: NormalizedOrderInput, corpus: OrderCorpus): ArtworkListing[] {
  const { sort, seed, query } = input;
  const terms = normalizeQuery(query);

  // A collection is an ordered sequence, not a filter over the global
  // pool — take the plate order as the base list so `sort` never gets a
  // chance to scramble it.
  let list: readonly ArtworkListing[] = input.collection
    ? corpus.plateSet(input.collection)
    : corpus.listings;
  const plateOrdered = Boolean(input.collection) && sort === "plate";

  if (terms.length > 0) list = list.filter((artwork) => matchesQuery(artwork, terms));
  if (input.era) list = list.filter((artwork) => assignEra(artwork) === input.era);
  if (input.artistSlug) {
    list = list.filter((artwork) => artwork.artistSlug === input.artistSlug);
  }
  if (input.color) {
    const color = input.color;
    list = list.filter((artwork) => artwork.colorBuckets?.includes(color) ?? false);
  }

  const sorted = plateOrdered
    ? [...list]
    : sortArtworkListings(list, sort, seed, corpus, input.color);
  const unfiltered =
    terms.length === 0 && !input.era && !input.artistSlug && !input.collection && !input.color;
  if (sort === "shuffle" && seed === DEFAULT_SHUFFLE_SEED && unfiltered) {
    return applyPinnedHead(sorted, PINNED_FIRST_PAGE_IDS);
  }
  // A search left on the default sort is ordered by how well each work
  // matches, not shuffled. This used to happen in the browser over
  // whatever pages had loaded so far, which meant the order changed as
  // the visitor scrolled and no server-side walk could reproduce it.
  if (sort === "shuffle" && terms.length > 0) return rankByRelevance(sorted, query);
  return sorted;
}

/** Fuzzy relevance over the substring-filtered list: title first, then
 *  artist. Works Fuse doesn't score keep their shuffled order behind the
 *  ones it does, so the ranking never drops a work the filter kept. Ties
 *  keep the input order, which is the seeded shuffle, so the result is
 *  deterministic. */
function rankByRelevance(list: ArtworkListing[], query: string): ArtworkListing[] {
  const fuse = new Fuse(list, {
    keys: [
      { name: "title", weight: 0.45 },
      { name: "artist", weight: 0.35 },
      { name: "movement", weight: 0.1 },
      { name: "nationality", weight: 0.1 },
    ],
    threshold: 0.33,
    ignoreLocation: true,
  });
  const ranked = fuse.search(query).map((result) => result.item);
  if (ranked.length === 0) return list;
  const seen = new Set(ranked.map((artwork) => artwork.id));
  return [...ranked, ...list.filter((artwork) => !seen.has(artwork.id))];
}

export function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_ARTWORK_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_ARTWORK_PAGE_SIZE, Math.trunc(limit)));
}

function sortArtworkListings(
  artworks: readonly ArtworkListing[],
  sort: ArtworkSort,
  seed: string,
  corpus: OrderCorpus,
  color?: ColorBucketId | "" | null,
): ArtworkListing[] {
  // Ranking by amount of a family only means something once a family has
  // been named; unfiltered, every work would be sorted against a colour
  // nobody asked for. Fall through to the shuffle instead.
  if (sort === "color" && color) return corpus.byColorStrength(artworks, color);
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
  // "plate" without a collection has no meaning — the caller asked for an
  // ordering that only exists inside a book. Same for "color" without a
  // family, handled above. Fall through to the shuffle rather than
  // silently returning input order.
  return shuffleWithArtistSpread(list, seed);
}

/** Deterministic shuffle that spreads each artist's works evenly across
 *  the whole sequence. Work i of an n-work bucket lands near fractional
 *  position (i + phase)/n, so every artist is dealt at a stride
 *  proportional to their share of the pool. Round-robin dealing (the
 *  previous approach) alternated artists only until the smaller buckets
 *  ran dry, leaving a long single-artist tail — on the natural-history
 *  era that read as 300+ consecutive Audubon plates. */
function shuffleWithArtistSpread(artworks: ArtworkListing[], seed: string): ArtworkListing[] {
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

/** Free-text match against one listing, using the same accent-folded,
 *  all-terms-must-hit rules as the paginated gallery endpoint. Exported
 *  so the timeline's server-side filter behaves identically to the
 *  grid's — an empty query matches everything. */
export function listingMatchesQuery(artwork: ArtworkListing, query: string): boolean {
  const terms = normalizeQuery(query);
  if (terms.length === 0) return true;
  return matchesQuery(artwork, terms);
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
