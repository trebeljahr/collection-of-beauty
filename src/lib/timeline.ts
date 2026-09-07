import { listingMatchesQuery } from "@/lib/artwork-pagination";
import { type ArtworkListing, artworkListings } from "@/lib/data";

export const TIMELINE_DECADE_SPAN = 10;

/** One histogram column: the decade's start year and how many dated
 *  works fall in it under the active filters. This — not the works
 *  themselves — is all the /timeline page needs to render the density
 *  chart and the per-decade section headers. */
export type TimelineDecade = { decade: number; count: number };

/** Everything the timeline grid actually reads off an artwork: a square
 *  thumbnail, the hover tooltip (title / artist / year), the mobile
 *  caption, and the two hrefs. Deliberately narrower than
 *  `ArtworkListing` — movement, nationality, width, height and
 *  realDimensions are filter/layout inputs the timeline resolves on the
 *  server, so shipping them per row would be dead weight on the wire. */
export type TimelineListing = Pick<
  ArtworkListing,
  | "id"
  | "title"
  | "englishTitle"
  | "artist"
  | "artistSlug"
  | "year"
  | "objectKey"
  | "variantWidths"
  | "dominantColor"
>;

export type TimelineFilter = {
  query?: string | null;
  movement?: string | null;
};

export type TimelineSummary = {
  decades: TimelineDecade[];
  /** Dated works matching the filters — the "N dated works across M
   *  decades" line, and the denominator the copy in page.tsx quotes. */
  total: number;
};

export function decadeOf(year: number): number {
  return Math.floor(year / TIMELINE_DECADE_SPAN) * TIMELINE_DECADE_SPAN;
}

/** Every dated work, deduped by id, in the order the timeline renders
 *  them (year ascending, title as tiebreaker). The dedupe is defensive:
 *  a slug collision in build-data.mjs used to be able to crash React
 *  with duplicate keys, and doing it once here beats doing it in the
 *  client on every render. */
let cachedDated: ArtworkListing[] | null = null;
function datedListings(): ArtworkListing[] {
  if (cachedDated) return cachedDated;
  const seen = new Set<string>();
  const dated: ArtworkListing[] = [];
  for (const artwork of artworkListings) {
    if (artwork.year == null) continue;
    if (seen.has(artwork.id)) continue;
    seen.add(artwork.id);
    dated.push(artwork);
  }
  dated.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
  cachedDated = dated;
  return dated;
}

function filterDated(filter: TimelineFilter): ArtworkListing[] {
  const query = filter.query?.trim() ?? "";
  const movement = filter.movement ?? "";
  let list = datedListings();
  if (movement) list = list.filter((artwork) => artwork.movement === movement);
  if (query) list = list.filter((artwork) => listingMatchesQuery(artwork, query));
  return list;
}

function histogram(list: readonly ArtworkListing[]): TimelineDecade[] {
  const counts = new Map<number, number>();
  for (const artwork of list) {
    if (artwork.year == null) continue;
    const decade = decadeOf(artwork.year);
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ decade, count }));
}

// Memoise the two filter shapes with a bounded key space: no filter at
// all (what every first visit renders) and one movement (32 of them).
// Free-text queries are deliberately not cached — the key space is
// whatever visitors type, and a linear scan of ~4.3k rows is cheap.
let cachedUnfiltered: TimelineSummary | null = null;
const cachedByMovement = new Map<string, TimelineSummary>();

export function getTimelineSummary(filter: TimelineFilter = {}): TimelineSummary {
  const query = filter.query?.trim() ?? "";
  const movement = filter.movement ?? "";

  if (!query && !movement) {
    if (!cachedUnfiltered) {
      const list = datedListings();
      cachedUnfiltered = { decades: histogram(list), total: list.length };
    }
    return cachedUnfiltered;
  }

  if (!query) {
    const hit = cachedByMovement.get(movement);
    if (hit) return hit;
    const list = filterDated({ movement });
    const summary = { decades: histogram(list), total: list.length };
    cachedByMovement.set(movement, summary);
    return summary;
  }

  const list = filterDated(filter);
  return { decades: histogram(list), total: list.length };
}

function toTimelineListing(artwork: ArtworkListing): TimelineListing {
  return {
    id: artwork.id,
    title: artwork.title,
    englishTitle: artwork.englishTitle,
    artist: artwork.artist,
    artistSlug: artwork.artistSlug,
    year: artwork.year,
    objectKey: artwork.objectKey,
    variantWidths: artwork.variantWidths,
    dominantColor: artwork.dominantColor,
  };
}

// Unfiltered decades are the common case (a visitor scrolling the
// default view pulls one per section), so keep the projected arrays —
// 62 entries, bounded by the corpus's decade span.
const cachedDecadeWorks = new Map<number, TimelineListing[]>();

/** The works of one decade, in render order. This is what the client
 *  fetches when a decade section scrolls into view. */
export function getTimelineDecadeWorks(
  decade: number,
  filter: TimelineFilter = {},
): TimelineListing[] {
  const query = filter.query?.trim() ?? "";
  const movement = filter.movement ?? "";

  if (!query && !movement) {
    const hit = cachedDecadeWorks.get(decade);
    if (hit) return hit;
    const works = datedListings()
      .filter((artwork) => artwork.year != null && decadeOf(artwork.year) === decade)
      .map(toTimelineListing);
    cachedDecadeWorks.set(decade, works);
    return works;
  }

  return filterDated(filter)
    .filter((artwork) => artwork.year != null && decadeOf(artwork.year) === decade)
    .map(toTimelineListing);
}
