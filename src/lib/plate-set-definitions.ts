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
 *  same four books, one id space, so /downloads/<slug> and
 *  /collection/<slug> can't drift apart or compete for the same query. */
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
  /** Editorial body, one string per paragraph. This is the text that
   *  ranks; the grid below it is not indexable past the first chunk. */
  intro: string[];
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
    intro: [
      "The Birds of America is the largest ornithological book ever published. Between 1827 and 1838 John James Audubon issued it in London and Edinburgh as a subscription work, delivered five plates at a time to a few hundred subscribers who paid for it over eleven years. The plates were engraved, etched and aquatinted after Audubon's watercolours — the great majority by Robert Havell Jr., whose London workshop carried the project from plate 11 to the end — then coloured by hand, sheet by sheet, by a team of colourists.",
      "The book's defining constraint is its size. Audubon insisted every bird appear life size, which forced the use of a \"double elephant\" folio sheet close to a metre tall, and forced the compositions into the shapes they are famous for: the flamingo folded double to fit the page, the whooping crane's neck bent back on itself, the wild turkey striding across the full width of the sheet.",
      "Audubon painted from freshly shot specimens wired into lifelike attitudes, and set them in habitat — fruiting branches, marsh grass, prey in the beak — at a time when the convention was a stiff profile against blank paper.",
    ],
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
    intro: [
      "Ernst Haeckel published Kunstformen der Natur in ten instalments of ten plates between 1899 and 1904, then as the collected hundred-plate volume the set is usually known by. Haeckel was a zoologist — he described thousands of new species, named the radiolarians that fill the opening plates, and coined the word ecology — but this book was aimed at artists and the general reader, as an argument that symmetry and pattern in nature are worth looking at as design.",
      "Each plate takes a single group — jellyfish, diatoms, bats, orchids, barnacles — and arranges its members into a composition rather than a chart, radiating them around a centre or ranking them into borders. The lithographs were drawn onto stone by Adolf Giltsch, working from Haeckel's watercolours and sketches, Giltsch drew the transparent tissues of the medusae himself.",
      "The plates fed directly into Art Nouveau. René Binet's entrance gate for the 1900 Exposition Universelle in Paris was modelled on a radiolarian, and the influence runs through Jugendstil ironwork, ceramics and glass. Modern biology has discarded some of Haeckel's claims — his recapitulation theory in particular — but the plates have never stopped being reprinted.",
    ],
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
    intro: [
      "Les Roses is the book that made Pierre-Joseph Redouté the most copied botanical artist in history. Issued in parts from 1817, it pairs his plates with descriptive text by the botanist Claude-Antoine Thory. Redouté had been drawing master to Marie Antoinette and then flower painter to the Empress Joséphine, and much of what he drew here he drew from Joséphine's garden at Malmaison, which held the most complete rose collection in Europe.",
      "The plates are colour-printed stipple engravings. Instead of building tone from cut lines, the stipple technique builds it from a dense field of dots, which holds gradation the way a wash does: a petal can shade from a saturated centre to a translucent edge with no visible hatching. Each sheet was inked in several colours in a single pull and then finished by hand, so no two impressions of the same plate are quite identical.",
      "The set also records a specific moment in breeding: the decades when repeat-flowering roses arriving from China were crossed with the European gallicas and damasks to produce the modern garden rose. A number of the varieties Redouté drew no longer exist outside these pages.",
    ],
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
    intro: [
      "Les Liliacées is Redouté's largest work. Eight folio volumes appeared between 1802 and 1816, funded largely by the Empress Joséphine, and the subject is far broader than the title suggests: alongside true lilies the plates cover irises, amaryllis, agapanthus, orchids, aloes, gingers and a good deal else that early-nineteenth-century botany filed under Liliaceae before the family was broken apart.",
      "The text was not Redouté's. The first four volumes were written by Augustin Pyramus de Candolle, one of the most important botanists of the century, with François Delaroche and then Alire Raffeneau-Delile taking over for the later volumes. The plates carry taxonomic text, not captions.",
      "Technically it is the same colour-printed stipple engraving as Les Roses, and it is where Redouté worked the method out at scale. The plates give a strap-leaved plant the full height of the sheet, and many carry small dissections beside the portrait — a stamen, an ovary in section, a seed — for identification.",
    ],
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
