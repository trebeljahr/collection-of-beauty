import { listingMatchesQuery } from "@/lib/artwork-order";
import type { ArtworkListing } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";

// The timeline's filters and histogram as pure functions of the dated
// works, so the browser can answer a search the export did not prebuild
// (static-data/client.ts). The server binds them to the catalogue with
// its caches in timeline.ts. Nothing here may import the catalogue.

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
 *  <ArtworkRows> needs the aspect ratio), its placeholder
 *  (`dominantColor`, and the `thumbHash` blur over it), the hover tooltip
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
  | "thumbHash"
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
 *  with duplicate keys. */
export function datedOf(listings: readonly ArtworkListing[]): ArtworkListing[] {
  const seen = new Set<string>();
  const dated: ArtworkListing[] = [];
  for (const artwork of listings) {
    if (artwork.year == null) continue;
    if (seen.has(artwork.id)) continue;
    seen.add(artwork.id);
    dated.push(artwork);
  }
  dated.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
  return dated;
}

export function filterDated(dated: ArtworkListing[], filter: TimelineFilter): ArtworkListing[] {
  const query = filter.query?.trim() ?? "";
  const era = filter.era ?? "";
  let list = dated;
  if (era) list = list.filter((artwork) => assignEra(artwork) === era);
  if (query) list = list.filter((artwork) => listingMatchesQuery(artwork, query));
  return list;
}

/** Same fallback as toGalleryPhoto's 800 x 1000 for a work without
 *  pixel dimensions, so the placeholder solves what the tiles will. */
function aspectOf(artwork: ArtworkListing): number {
  return Math.round(((artwork.width ?? 800) / (artwork.height ?? 1000)) * 1000) / 1000;
}

export function histogram(list: readonly ArtworkListing[]): TimelineDecade[] {
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

export function summaryOf(list: readonly ArtworkListing[]): TimelineSummary {
  return { decades: histogram(list), total: list.length };
}

export function toTimelineListing(artwork: ArtworkListing): TimelineListing {
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
    thumbHash: artwork.thumbHash,
  };
}

/** One decade's works out of an already filtered dated list. */
export function decadeWorksOf(list: readonly ArtworkListing[], decade: number): TimelineListing[] {
  return list
    .filter((artwork) => artwork.year != null && decadeOf(artwork.year) === decade)
    .map(toTimelineListing);
}
