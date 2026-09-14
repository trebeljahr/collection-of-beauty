import { listingMatchesQuery } from "@/lib/artwork-pagination";
import { type ArtworkListing, artworkListings } from "@/lib/data";
import { assignEra, type EraId, isEraId } from "@/lib/gallery-eras";

export const TIMELINE_DECADE_SPAN = 10;

/** One histogram column: the decade's start year, how many dated works
 *  fall in it under the active filters, and those works' aspect ratios
 *  (width / height, in render order, 3 decimals). This — not the works
 *  themselves — is all the /timeline page needs to render the density
 *  chart, the per-decade section headers, and a placeholder exactly as
 *  tall as the justified rows the works will fill (~20 KB for the whole
 *  corpus, against the ~4,300 records it stands in for). */
export type TimelineDecade = { decade: number; count: number; aspects: number[] };

/** Everything a timeline tile actually reads off an artwork: the
 *  thumbnail and its pixel size (the justified row solver in
 *  <ArtworkRows> needs the aspect ratio), the hover tooltip
 *  (title / artist / year), and the href. Deliberately narrower than
 *  `ArtworkListing` — movement, nationality and realDimensions are
 *  filter inputs the timeline resolves on the server, so shipping them
 *  per row would be dead weight on the wire. */
export type TimelineListing = Pick<
  ArtworkListing,
  | "id"
  | "title"
  | "englishTitle"
  | "artist"
  | "year"
  | "objectKey"
  | "variantWidths"
  | "width"
  | "height"
  | "dominantColor"
>;

export type TimelineFilter = {
  query?: string | null;
  /** Era id. Anything that isn't one of the 11 ids filters nothing out
   *  of the corpus and matches nothing, same as an unknown movement used to. */
  era?: string | null;
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
  const era = filter.era ?? "";
  let list = datedListings();
  if (era) list = list.filter((artwork) => assignEra(artwork) === era);
  if (query) list = list.filter((artwork) => listingMatchesQuery(artwork, query));
  return list;
}

/** Same fallback as toGalleryPhoto's 800 x 1000 for a work without
 *  pixel dimensions, so the placeholder solves what the tiles will. */
function aspectOf(artwork: ArtworkListing): number {
  return Math.round(((artwork.width ?? 800) / (artwork.height ?? 1000)) * 1000) / 1000;
}

function histogram(list: readonly ArtworkListing[]): TimelineDecade[] {
  const byDecade = new Map<number, number[]>();
  for (const artwork of list) {
    if (artwork.year == null) continue;
    const decade = decadeOf(artwork.year);
    const aspects = byDecade.get(decade);
    if (aspects) aspects.push(aspectOf(artwork));
    else byDecade.set(decade, [aspectOf(artwork)]);
  }
  return Array.from(byDecade.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([decade, aspects]) => ({ decade, count: aspects.length, aspects }));
}

// Memoise the two filter shapes with a bounded key space: no filter at
// all (what every first visit renders) and one era (11 of them).
// Free-text queries are deliberately not cached — the key space is
// whatever visitors type, and a linear scan of ~4.3k rows is cheap.
//
// These caches sit behind /api/timeline/decades and /api/timeline/works,
// which hand their query params straight through, so the key has to be
// validated against the corpus before it can reach a Map — otherwise the
// public route retains one entry per distinct string a visitor invents.
// An unrecognised era still answers, it just answers uncached (and
// matches nothing, so the scan is trivial). The size caps below are
// belt-and-braces: with the validation in place neither map can exceed
// the corpus's own key count.
const MAX_CACHED_ERAS = 128;
const MAX_CACHED_DECADES = 128;

let cachedUnfiltered: TimelineSummary | null = null;
const cachedByEra = new Map<EraId, TimelineSummary>();

export function getTimelineSummary(filter: TimelineFilter = {}): TimelineSummary {
  const query = filter.query?.trim() ?? "";
  const era = filter.era ?? "";

  if (!query && !era) {
    if (!cachedUnfiltered) {
      const list = datedListings();
      cachedUnfiltered = { decades: histogram(list), total: list.length };
    }
    return cachedUnfiltered;
  }

  if (!query) {
    const cacheable = isEraId(era);
    if (cacheable) {
      const hit = cachedByEra.get(era);
      if (hit) return hit;
    }
    const list = filterDated({ era });
    const summary = { decades: histogram(list), total: list.length };
    if (cacheable && cachedByEra.size < MAX_CACHED_ERAS) {
      cachedByEra.set(era, summary);
    }
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
    year: artwork.year,
    objectKey: artwork.objectKey,
    variantWidths: artwork.variantWidths,
    width: artwork.width,
    height: artwork.height,
    dominantColor: artwork.dominantColor,
  };
}

// Unfiltered decades are the common case (a visitor scrolling the
// default view pulls one per section), so keep the projected arrays —
// 62 entries, bounded by the corpus's decade span. `?decade=` is caller
// input, so only decades the corpus actually spans become keys; anything
// else answers uncached with the empty list it already produced.
const cachedDecadeWorks = new Map<number, TimelineListing[]>();

/** Lazily derived from `datedListings()`, which is sorted year-ascending
 *  — so its ends are the corpus's min and max year. */
let corpusDecades: { first: number; last: number } | null = null;
function corpusDecadeRange(): { first: number; last: number } | null {
  if (corpusDecades) return corpusDecades;
  const dated = datedListings();
  const first = dated[0]?.year;
  const last = dated[dated.length - 1]?.year;
  if (first == null || last == null) return null;
  corpusDecades = { first: decadeOf(first), last: decadeOf(last) };
  return corpusDecades;
}

function isCorpusDecade(decade: number): boolean {
  if (!Number.isInteger(decade) || decade % TIMELINE_DECADE_SPAN !== 0) return false;
  const range = corpusDecadeRange();
  return range != null && decade >= range.first && decade <= range.last;
}

/** The works of one decade, in render order. This is what the client
 *  fetches when a decade section scrolls into view. */
export function getTimelineDecadeWorks(
  decade: number,
  filter: TimelineFilter = {},
): TimelineListing[] {
  const query = filter.query?.trim() ?? "";
  const era = filter.era ?? "";

  if (!query && !era) {
    const cacheable = isCorpusDecade(decade);
    if (cacheable) {
      const hit = cachedDecadeWorks.get(decade);
      if (hit) return hit;
    }
    const works = datedListings()
      .filter((artwork) => artwork.year != null && decadeOf(artwork.year) === decade)
      .map(toTimelineListing);
    if (cacheable && cachedDecadeWorks.size < MAX_CACHED_DECADES) {
      cachedDecadeWorks.set(decade, works);
    }
    return works;
  }

  return filterDated(filter)
    .filter((artwork) => artwork.year != null && decadeOf(artwork.year) === decade)
    .map(toTimelineListing);
}
