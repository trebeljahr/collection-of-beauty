import type { Artwork } from "@/lib/data";
import type { EraId } from "@/lib/gallery-eras";

/**
 * Plate-set *definitions*, kept free of the data files.
 *
 * Everything here is either a literal or a function over a single
 * `Artwork` passed in by the caller — the `Artwork` import is type-only
 * and erases at compile time. That matters because `scope-href.ts`
 * needs the set ids to validate a `?from=collection:<id>` param, and
 * `scope-href` is imported by client components specifically so they
 * don't drag artworks.json into a browser chunk. The derived half
 * (which does read the catalogue) lives in `plate-sets.ts`.
 *
 * Plate sets — the four illustrated books held here in full or near-full
 * runs. Unlike an era (a bucket we invented) or an artist (a person), a
 * plate set is a *published work* with a fixed, externally-known extent:
 * "The Birds of America" is 435 plates whether or not we hold them all.
 *
 * That makes the completeness claim the load-bearing part of these pages,
 * so nothing here is hand-typed. Plate numbers are recovered from the
 * source records the ingest already carries (filename, source URL, or the
 * Commons credit line), and every count rendered on a page is derived
 * from that recovery at module load. If a plate is missing, the page says
 * so — `canonicalPlateCount` is the published extent, `numberedCount` is
 * what we can actually account for, and `missingPlateNumbers` is the gap
 * between them.
 */

/** Ids are the `Collection.slug` values from `@/lib/collections` — the
 *  same four books, one id space, so /collection/<slug> and
 *  /api/collections/<slug> can't drift apart. */
export type PlateSetId =
  | "audubon-birds-of-america"
  | "haeckel-kunstformen-der-natur"
  | "redoute-les-roses"
  | "redoute-les-liliacees";

/** Recover the printed plate number for one artwork, or null when the
 *  source records don't carry it. Each set stores it somewhere different
 *  — see the per-set implementations below. */
type PlateNumberResolver = (artwork: Artwork) => number | null;

export type PlateSetDefinition = {
  id: PlateSetId;
  /** `Artwork.folder` this set is drawn from. One folder per set. */
  folder: string;
  /** Original-language or full title, shown as a subtitle. Title,
   *  creator and publication span are NOT repeated here — they live in
   *  `@/lib/collections` and are read from there, so the two surfaces
   *  for these books state the same facts. */
  subtitle: string | null;
  /** Artist slug, for the /artist/<slug> link. */
  authorSlug: string;
  /** Era floor these plates hang on, for the cross-link. */
  eraId: EraId;
  /** Plates in the complete published work. This is the number the
   *  completeness claim is measured against, so it must be the settled
   *  bibliographic count — not our holding. */
  canonicalPlateCount: number;
  /** One-line summary used in card subtitles and meta descriptions. */
  tagline: string;
  resolvePlateNumber: PlateNumberResolver;
};

// ── plate-number recovery ───────────────────────────────────────────────

/** `audubon-birds/318_American_Avocet.jpg` → 318. Havell's plate number
 *  is the filename prefix on every one of the 435 Commons files. */
function plateFromFilenamePrefix(artwork: Artwork): number | null {
  const basename = artwork.objectKey.split("/").pop() ?? "";
  const match = basename.match(/^(\d+)_/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** `…/redoute/large/lilies-004-light.jpg` → 4. Rougeux's restoration
 *  filenames are keyed to the plate number; our own object keys are keyed
 *  to the species name, so the source URL is the only place it survives. */
function plateFromRedouteSourceUrl(artwork: Artwork): number | null {
  const match = artwork.fileUrl.match(/\/(?:roses|lilies)-(\d+)-/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** `Kunstformen der Natur (1904), plate 82: Hepaticae` → 82. The Commons
 *  credit line carries it for every plate; a handful read
 *  "plate/planche N". Falls back to the description (written against the
 *  plate during the description audit) and then to the numeric suffix
 *  some filenames use. The three sources never disagree where they
 *  overlap. */
function plateFromCreditLine(artwork: Artwork): number | null {
  const fromCredit = artwork.credit?.match(/plate(?:\/planche)?\s+(\d+)/i);
  if (fromCredit) return Number.parseInt(fromCredit[1], 10);
  const fromDescription = artwork.description?.match(/\bplate\s+(\d+)/i);
  if (fromDescription) return Number.parseInt(fromDescription[1], 10);
  const basename = artwork.objectKey.split("/").pop() ?? "";
  const fromFilename = basename.match(/^Haeckel_[A-Za-z]+_(\d+)\./);
  return fromFilename ? Number.parseInt(fromFilename[1], 10) : null;
}

// ── set definitions ─────────────────────────────────────────────────────

export const PLATE_SETS: PlateSetDefinition[] = [
  {
    id: "audubon-birds-of-america",
    folder: "audubon-birds",
    subtitle: null,
    authorSlug: "john-james-audubon",
    eraId: "natural-history",
    canonicalPlateCount: 435,
    tagline: "Audubon's double elephant folio, every plate at life size.",
    resolvePlateNumber: plateFromFilenamePrefix,
  },
  {
    id: "haeckel-kunstformen-der-natur",
    folder: "kunstformen-images",
    subtitle: "Art Forms in Nature",
    authorSlug: "ernst-haeckel",
    eraId: "natural-history",
    canonicalPlateCount: 100,
    tagline: "Haeckel's hundred lithographs of radiolarians, medusae and orchids.",
    resolvePlateNumber: plateFromCreditLine,
  },
  {
    id: "redoute-les-roses",
    folder: "redoute-roses",
    subtitle: null,
    authorSlug: "pierre-joseph-redoute",
    eraId: "natural-history",
    canonicalPlateCount: 169,
    tagline: "Redouté's roses, in colour-printed stipple engraving.",
    resolvePlateNumber: plateFromRedouteSourceUrl,
  },
  {
    id: "redoute-les-liliacees",
    folder: "redoute-lilies",
    subtitle: null,
    authorSlug: "pierre-joseph-redoute",
    eraId: "natural-history",
    canonicalPlateCount: 486,
    tagline: "Redouté's eight-volume study of lilies, irises and their relatives.",
    resolvePlateNumber: plateFromRedouteSourceUrl,
  },
];

/** Every plate-set id, for callers that need to validate one without
 *  reading the catalogue. */
export const PLATE_SET_IDS: ReadonlySet<string> = new Set(PLATE_SETS.map((d) => d.id));

/** Whether a string names one of the plate sets. Data-free, so
 *  `scope-href.ts` can use it on the client. */
export function isPlateSetId(id: string): id is PlateSetId {
  return PLATE_SET_IDS.has(id);
}
