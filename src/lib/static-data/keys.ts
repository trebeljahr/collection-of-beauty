import type { NormalizedOrderInput } from "@/lib/artwork-order";
import { DEFAULT_ARTWORK_PAGE_SIZE, DEFAULT_SHUFFLE_SEED } from "@/lib/artwork-page-schema";

// Where the static export keeps the answers the per-request API used to
// compute. Pure and catalogue-free: the build (src/app/data/**) writes
// these paths and the browser (client.ts) reads them, so both sides must
// derive the same key from the same input.
//
// Only orderings a page of the site actually requests are prebuilt: no
// search, the default seed, and one of the shapes below. Anything else,
// a search above all, is answered in the browser by the same ordering
// code over /data/museum.json (engine.ts).

/** Every prebuilt page holds this many works. A request for another
 *  window is cut from the pages it overlaps. */
export const STATIC_PAGE_SIZE = DEFAULT_ARTWORK_PAGE_SIZE;

export const GALLERY_SORTS = ["shuffle", "year", "artist"] as const;

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** The file key of a prebuilt ordering, or null when it is not prebuilt.
 *
 *    shuffle | year | artist      the home grid, unfiltered
 *    <sort>.era-<era>             the home grid filtered to an era; the
 *                                 era page is shuffle.era-<era>
 *    artist-<slug>                an artist page (year order)
 *    plates-<set>                 a plate set (book order)
 *    colour-<family>              a colour page (strongest first) */
export function orderKey(input: NormalizedOrderInput): string | null {
  if (input.query || input.seed !== DEFAULT_SHUFFLE_SEED) return null;
  const { sort, era, artistSlug, collection, color } = input;
  const facets = [era, artistSlug, collection, color].filter(Boolean).length;
  if (facets > 1) return null;
  if (artistSlug) return sort === "year" && SLUG.test(artistSlug) ? `artist-${artistSlug}` : null;
  if (collection) return sort === "plate" && SLUG.test(collection) ? `plates-${collection}` : null;
  if (color) return sort === "color" && SLUG.test(color) ? `colour-${color}` : null;
  if (!(GALLERY_SORTS as readonly string[]).includes(sort)) return null;
  if (era) return SLUG.test(era) ? `${sort}.era-${era}` : null;
  return sort;
}

/** The timeline's key: unfiltered or one era. Null for a search. */
export function timelineKey(filter: { query?: string | null; era?: string | null }): string | null {
  if (filter.query?.trim()) return null;
  if (!filter.era) return "all";
  return SLUG.test(filter.era) ? `era-${filter.era}` : null;
}

export const STATIC_DATA = {
  /** Every listing with its ThumbHash, for the 3D museum and the browser engine. */
  museum: "/data/museum.json",
  /** Orders the browser cannot derive from listings: plate and colour order. */
  orders: "/data/orders.json",
  surprisePool: "/data/surprise-pool.json",
  notFoundIndex: "/data/not-found.json",
  /** The catalogue without ThumbHash (also the public dataset at /api/artworks). */
  catalogue: "/api/artworks",
  page: (key: string, index: number) => `/data/pages/${key}/${index}.json`,
  scopeIds: (key: string) => `/data/scopes/${key}.json`,
  timelineScopeIds: (key: string) => `/data/scopes/timeline.${key}.json`,
  timelineSummary: (key: string) => `/data/timeline/${key}.json`,
  timelineDecade: (key: string, decade: number) => `/data/timeline/${key}/${decade}.json`,
  /** One work's text for the 3D museum's info pill. */
  about: (id: string) => `/data/about/${id}.json`,
} as const;

/** Plate and colour orders as id lists, the one input to an ordering that
 *  the listings do not carry (`colorStrength` stays server-side). */
export type StaticOrders = {
  plates: Record<string, string[]>;
  colours: Record<string, string[]>;
};
