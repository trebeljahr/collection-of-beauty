import { type ArtworkListing, artworkListings } from "@/lib/data";
import { type EraId, isEraId } from "@/lib/gallery-eras";
import {
  datedOf,
  decadeOf,
  decadeWorksOf,
  filterDated as filterDatedOf,
  summaryOf,
  TIMELINE_DECADE_SPAN,
  type TimelineFilter,
  type TimelineListing,
  type TimelineSummary,
} from "@/lib/timeline-core";

export {
  decadeOf,
  TIMELINE_DECADE_SPAN,
  type TimelineDecade,
  type TimelineFilter,
  type TimelineListing,
  type TimelineSummary,
} from "@/lib/timeline-core";

/** Every dated work in render order, computed once. */
let cachedDated: ArtworkListing[] | null = null;
function datedListings(): ArtworkListing[] {
  cachedDated ??= datedOf(artworkListings);
  return cachedDated;
}

/** Every dated work matching the filter, in the order the timeline
 *  renders them top to bottom. This is the `decade` scope's sequence:
 *  prev/next from a timeline tile walks it straight across decade
 *  boundaries. Shared with the module cache, so callers must not mutate
 *  it. */
export function timelineListings(filter: TimelineFilter = {}): ArtworkListing[] {
  return filterDated(filter);
}

function filterDated(filter: TimelineFilter): ArtworkListing[] {
  return filterDatedOf(datedListings(), filter);
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
      cachedUnfiltered = summaryOf(list);
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
    const summary = summaryOf(list);
    if (cacheable && cachedByEra.size < MAX_CACHED_ERAS) {
      cachedByEra.set(era, summary);
    }
    return summary;
  }

  return summaryOf(filterDated(filter));
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
    const works = decadeWorksOf(datedListings(), decade);
    if (cacheable && cachedDecadeWorks.size < MAX_CACHED_DECADES) {
      cachedDecadeWorks.set(decade, works);
    }
    return works;
  }

  return decadeWorksOf(filterDated(filter), decade);
}
