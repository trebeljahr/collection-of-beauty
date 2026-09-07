import { displayTitle } from "@/lib/artwork-format";
import { type Artwork, type ArtworkListing, artworkListings, artworks } from "@/lib/data";
import {
  isPlateSetId,
  PLATE_SETS,
  type PlateSetDefinition,
  type PlateSetId,
} from "@/lib/plate-set-definitions";

/** The catalogue-reading half of the plate sets: takes the pure
 *  definitions and resolves them against artworks.json. Anything that
 *  imports this pulls the whole catalogue, so client components must go
 *  through `plate-set-definitions` (or `scope-href`) instead. */

export { isPlateSetId, PLATE_SETS, type PlateSetDefinition, type PlateSetId };

// ── derived from the catalogue, memoised ───────────────────────────────────────────────────

export type Plate = {
  listing: ArtworkListing;
  /** Printed plate number, or null when the source records don't carry
   *  one. Plates without a number sort to the end. */
  plateNumber: number | null;
};

export type PlateSet = PlateSetDefinition & {
  /** Plates ordered as the book orders them: by plate number, unnumbered
   *  last, title as the tiebreaker. */
  plates: Plate[];
  /** How many plates from this set are actually here. */
  presentCount: number;
  /** How many of those carry a recovered plate number. */
  numberedCount: number;
  /** Plate numbers from 1..canonicalPlateCount with nothing against
   *  them. Empty when every number is accounted for. */
  missingPlateNumbers: number[];
  /** How many distinct plate numbers the holding accounts for. Lower
   *  than `presentCount` wherever a number carries two plates. */
  distinctPlateNumbers: number;
  /** Numbers claimed by more than one plate. Legitimate for Les
   *  Liliacées, which carries "bis" plates sharing a number; a
   *  transcription slip in a source credit line elsewhere. Either way
   *  it means the numbering, not the holding, is imprecise. */
  sharedPlateNumbers: number[];
  /** True when we hold at least as many plates as the published work
   *  contains. This is the completeness claim the page makes — it is
   *  about the holding, and is deliberately independent of whether
   *  every plate *number* resolved cleanly. */
  isComplete: boolean;
  /** Publication span as the artwork records give it, e.g. "1827–1838"
   *  or "1904". Derived rather than typed so it can't drift from the
   *  data. Display only — the en dash makes it unusable as a date. */
  publishedLabel: string;
  /** First and last publication year as numbers. JSON-LD needs a real
   *  ISO date for `datePublished` and an ISO 8601 interval for
   *  `temporalCoverage`; neither can take the display label. */
  publishedFrom: number;
  publishedTo: number;
};

/** Every publication year mentioned in an artwork's date fields.
 *  `dateCreated` carries ranges like "between 1802 and 1804", which is
 *  richer than the single `year` column — but Audubon's entries append
 *  the underlying painting date in brackets ("1827-1838 (publication;
 *  from a painting made in Louisiana in 1821)"), and that is not part of
 *  the publication span. Parenthesised asides are dropped first. */
function yearsMentioned(artwork: Artwork): number[] {
  const source = artwork.dateCreated ?? (artwork.year != null ? String(artwork.year) : "");
  const found = source.replace(/\([^)]*\)/g, " ").match(/\b(1[5-9]\d{2}|20\d{2})\b/g) ?? [];
  return found.map((y) => Number.parseInt(y, 10));
}

function publicationSpan(members: Artwork[]): {
  label: string;
  from: number;
  to: number;
} {
  const years = members.flatMap(yearsMentioned);
  if (years.length === 0) return { label: "date unrecorded", from: 0, to: 0 };
  const from = Math.min(...years);
  const to = Math.max(...years);
  return { label: from === to ? String(from) : `${from}–${to}`, from, to };
}

function buildPlateSet(definition: PlateSetDefinition): PlateSet {
  const members = artworks.filter((a) => a.folder === definition.folder);
  const span = publicationSpan(members);
  const listingById = new Map(artworkListings.map((l) => [l.id, l]));

  const plates: Plate[] = members.flatMap((artwork) => {
    const listing = listingById.get(artwork.id);
    // artworkListings is a 1:1 projection of artworks, so this can't miss
    // — but skipping beats rendering a hole if that ever stops being true.
    if (!listing) return [];
    return [{ listing, plateNumber: definition.resolvePlateNumber(artwork) }];
  });

  plates.sort(
    (a, b) =>
      (a.plateNumber ?? Number.MAX_SAFE_INTEGER) - (b.plateNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.listing.title.localeCompare(b.listing.title) ||
      a.listing.id.localeCompare(b.listing.id),
  );

  const claimed = new Set<number>();
  for (const plate of plates) {
    if (plate.plateNumber != null) claimed.add(plate.plateNumber);
  }
  const missingPlateNumbers: number[] = [];
  for (let n = 1; n <= definition.canonicalPlateCount; n++) {
    if (!claimed.has(n)) missingPlateNumbers.push(n);
  }
  const seen = new Map<number, number>();
  for (const plate of plates) {
    if (plate.plateNumber != null)
      seen.set(plate.plateNumber, (seen.get(plate.plateNumber) ?? 0) + 1);
  }
  const sharedPlateNumbers = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([n]) => n)
    .sort((a, b) => a - b);

  return {
    ...definition,
    plates,
    presentCount: plates.length,
    numberedCount: plates.filter((p) => p.plateNumber != null).length,
    missingPlateNumbers,
    distinctPlateNumbers: claimed.size,
    sharedPlateNumbers,
    isComplete: plates.length >= definition.canonicalPlateCount,
    publishedLabel: span.label,
    publishedFrom: span.from,
    publishedTo: span.to,
  };
}

let cache: Map<PlateSetId, PlateSet> | null = null;

function allSets(): Map<PlateSetId, PlateSet> {
  if (cache) return cache;
  cache = new Map(PLATE_SETS.map((d) => [d.id, buildPlateSet(d)]));
  return cache;
}

export function getPlateSets(): PlateSet[] {
  return PLATE_SETS.map((d) => allSets().get(d.id) as PlateSet);
}

export function getPlateSet(id: string): PlateSet | null {
  return allSets().get(id as PlateSetId) ?? null;
}

/** Plates of a set as plain listings, in plate order. The ordering the
 *  collection page, its lightbox scope and its paginated load-more all
 *  share — they must agree or prev/next walks a different sequence than
 *  the grid shows. */
export function plateSetListings(id: string): ArtworkListing[] {
  return getPlateSet(id)?.plates.map((p) => p.listing) ?? [];
}

/** The plate set an artwork belongs to, or null. Drives the "part of"
 *  backlink on the artwork detail page. */
export function plateSetForArtwork(artwork: { folder: string }): PlateSet | null {
  const definition = PLATE_SETS.find((d) => d.folder === artwork.folder);
  return definition ? (allSets().get(definition.id) as PlateSet) : null;
}

/** Printed plate number for one artwork within its set, or null. */
export function plateNumberFor(artworkId: string, setId: PlateSetId): number | null {
  return (
    allSets()
      .get(setId)
      ?.plates.find((p) => p.listing.id === artworkId)?.plateNumber ?? null
  );
}

/** One sentence stating exactly how much of the published work is here.
 *  Rendered on the page and reused as the meta description, so the
 *  completeness claim is written once and derived from the data rather
 *  than typed into prose that can go stale. */
export function holdingSentence(set: PlateSet): string {
  if (set.isComplete) {
    return `All ${set.canonicalPlateCount} plates of the complete work are here.`;
  }
  return `${set.presentCount} of the work's ${set.canonicalPlateCount} plates are here.`;
}

/**
 * Everything qualifying the headline count, as separate paragraphs.
 *
 * There are two independent things that can be imperfect and they must
 * not be blurred together: the *holding* (do we have every plate?) and
 * the *numbering* (does every plate number resolve to exactly one
 * plate?). Les Liliacées is short of plates. Kunstformen is not short of
 * plates but has one duplicated number in its source credits. Stating
 * both as "incomplete" would be wrong in one direction; stating neither
 * would be wrong in the other.
 *
 * Empty array when the set is complete and cleanly numbered.
 */
export function holdingCaveats(set: PlateSet): string[] {
  const notes: string[] = [];
  const shared = set.sharedPlateNumbers;

  if (!set.isComplete) {
    const covered = set.distinctPlateNumbers;
    const doubled =
      shared.length > 0
        ? ` — ${numberWord(shared.length)} number${shared.length === 1 ? "" : "s"} ` +
          `carr${shared.length === 1 ? "ies" : "y"} two plates each`
        : "";
    notes.push(
      `Those ${set.presentCount} scans cover ${covered} of the work's ` +
        `${set.canonicalPlateCount} plate numbers${doubled}. ` +
        `${set.missingPlateNumbers.length} number${set.missingPlateNumbers.length === 1 ? "" : "s"} ` +
        `${set.missingPlateNumbers.length === 1 ? "is" : "are"} not represented: ` +
        `${set.missingPlateNumbers.join(", ")}.`,
    );
    return notes;
  }

  // Complete holding, but the numbering recovered from the source
  // records doesn't line up one-to-one.
  const problems: string[] = [];
  if (shared.length > 0) {
    problems.push(
      `plate number${shared.length === 1 ? "" : "s"} ${shared.join(", ")} ` +
        `${shared.length === 1 ? "is" : "are"} claimed by two plates`,
    );
  }
  if (set.missingPlateNumbers.length > 0) {
    const missing = set.missingPlateNumbers;
    problems.push(
      `no plate carries the number${missing.length === 1 ? "" : "s"} ${missing.join(", ")}`,
    );
  }
  if (problems.length > 0) {
    notes.push(
      `Every plate is present, but the plate numbers come from the source records rather ` +
        `than from us, and they don't quite reconcile: ${problems.join(", and ")}. ` +
        `The ordering below follows the numbers as recorded.`,
    );
  }
  return notes;
}

function numberWord(n: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return words[n] ?? String(n);
}

/** Readable label for one plate. Kunstformen filenames became titles of
 *  the form "Haeckel Discomedusae 98" — the artist's name and the plate
 *  number are both already rendered alongside, so strip them rather than
 *  print "Plate 98 · Haeckel Discomedusae 98". */
export function plateLabel(set: PlateSet, plate: Plate): string {
  const title = displayTitle(plate.listing);
  if (set.id === "kunstformen-der-natur") {
    return title.replace(/^Haeckel\s+/i, "").replace(/\s+\d+$/, "");
  }
  if (set.id === "birds-of-america") {
    const trimmed = title.replace(/\s*\(Plate\s+\d+\)\s*$/i, "");
    // A few titles lead with the plate number instead ("433 Orioles,
    // Mexican Goldfinch…"), which would render as "433 433 Orioles…"
    // beside the number column. Only strip it when it matches this
    // plate's own number, so a title that genuinely opens with a
    // numeral survives.
    if (plate.plateNumber != null) {
      const leading = new RegExp(`^${plate.plateNumber}\\s+(?=\\D)`);
      return trimmed.replace(leading, "");
    }
    return trimmed;
  }
  return title;
}
