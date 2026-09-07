// The four coherent plate sets in the catalogue — books that were
// published as a numbered series rather than assembled by a curator.
// They are the sets where "give me the whole thing" is a reasonable ask,
// so they're the only ones offered as a ZIP.
//
// Everything here is derived from `folder`, which is how the ingest
// pipeline groups a source. A fifth set means a fifth entry, not a
// schema change.

import { type ArtworkListing, artworkListings } from "@/lib/data";
import { slugify } from "@/lib/utils";

/**
 * Width used for every file inside a collection ZIP.
 *
 * Not the largest available, deliberately. At 2,560 px the four sets
 * weigh 86–225 MB; at 4,096 they run to 353 MB and at full size the
 * Audubon set alone is several GB. 2,560 px is a 6.5-megapixel image —
 * enough to print an A3 plate at 200 dpi — and it is the widest rung
 * every artwork in all four sets actually has. Anyone who wants the
 * 11,000 px scan of a single plate takes the per-artwork download.
 */
export const ZIP_VARIANT_WIDTH = 2560;

/**
 * Hard ceiling on entries in a generated ZIP.
 *
 * Two reasons, one cosmetic and one structural. Structurally, a plain
 * (non-Zip64) archive can hold 65,535 entries and address 4 GiB of
 * offsets; staying far below that is what lets `zip-stream.ts` skip
 * Zip64 entirely. Practically, each entry is a separate origin fetch,
 * so the cap also bounds how long a single request can hold a
 * connection open. The largest set today is 475 plates.
 */
export const ZIP_MAX_ENTRIES = 600;

export type Collection = {
  /** URL slug: /downloads/<slug> and /api/collections/<slug>. */
  slug: string;
  /** `Artwork.folder` this set maps to. */
  folder: string;
  /** Work's own title, as it was published. */
  title: string;
  creator: string;
  /** Publication span, for prose. */
  published: string;
  /** One-paragraph description used on the collection page and in the
   *  ZIP's README. Plain facts — this text is indexable. */
  blurb: string;
  /** Who digitised or restored the plates. */
  sourceNote: string;
};

export const COLLECTIONS: Collection[] = [
  {
    slug: "audubon-birds-of-america",
    folder: "audubon-birds",
    title: "The Birds of America",
    creator: "John James Audubon",
    published: "1827–1838",
    blurb:
      "Audubon's double-elephant folio, engraved and hand-coloured at life size — every bird drawn to the full scale of the plate, which is why the compositions bend and fold to fit. This set is the complete run of 435 plates, scanned by the University of Pittsburgh.",
    sourceNote: "Scans by the University of Pittsburgh, via Wikimedia Commons.",
  },
  {
    slug: "redoute-les-roses",
    folder: "redoute-roses",
    title: "Les Roses",
    creator: "Pierre-Joseph Redouté",
    published: "1817–1824",
    blurb:
      "Redouté's roses, made as stipple engravings finished by hand — the technique that let him hold a petal's tonal gradient without visible hatching. 169 plates, restored from the originals by Nicholas Rougeux.",
    sourceNote: "Restorations by Nicholas Rougeux (c82.net), after Pierre-Joseph Redouté.",
  },
  {
    slug: "redoute-les-liliacees",
    folder: "redoute-lilies",
    title: "Les Liliacées",
    creator: "Pierre-Joseph Redouté",
    published: "1802–1816",
    blurb:
      "The larger and earlier of Redouté's two great flower books, commissioned by Joséphine Bonaparte for the gardens at Malmaison. 475 plates covering lilies, irises, orchids and their relatives, restored by Nicholas Rougeux.",
    sourceNote: "Restorations by Nicholas Rougeux (c82.net), after Pierre-Joseph Redouté.",
  },
  {
    slug: "haeckel-kunstformen-der-natur",
    folder: "kunstformen-images",
    title: "Kunstformen der Natur",
    creator: "Ernst Haeckel",
    published: "1899–1904",
    blurb:
      "Haeckel's lithographs of radiolarians, jellyfish, diatoms and orchids, arranged for symmetry rather than for the page — the plates that fed directly into Art Nouveau. 100 plates from the 1904 collected edition.",
    sourceNote: "Scans via Wikimedia Commons.",
  },
];

export function getCollection(slug: string): Collection | null {
  return COLLECTIONS.find((c) => c.slug === slug) ?? null;
}

/**
 * Which ingest folder an artwork came from.
 *
 * `ArtworkListing` deliberately doesn't carry `folder` — it's a slim
 * projection and every field in it is paid for in the RSC payload of
 * every page that ships listings. The folder is the first segment of
 * `objectKey` by construction (`assets/<folder>/<filename>`), so we read
 * it back rather than widening the projection for four pages.
 */
function folderOf(art: ArtworkListing): string {
  const i = art.objectKey.indexOf("/");
  return i === -1 ? "" : art.objectKey.slice(0, i);
}

/**
 * The works in a set, in plate order.
 *
 * Sorted by title with a numeric collator so "Plate 2" precedes
 * "Plate 10" — a plain lexicographic sort scatters the Audubon plates,
 * and plate order is the one ordering a bound folio actually has.
 */
export function collectionArtworks(collection: Collection): ArtworkListing[] {
  return artworkListings
    .filter((a) => folderOf(a) === collection.folder)
    .sort((a, b) =>
      (a.englishTitle ?? a.title).localeCompare(b.englishTitle ?? b.title, "en", {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

/**
 * The works actually included in a ZIP: plate order, only those that
 * have the ZIP width built, capped at `ZIP_MAX_ENTRIES`.
 *
 * The `variantWidths` filter is the same guard the rest of the download
 * surface uses — an entry whose variant doesn't exist would 404 mid-
 * stream, and a ZIP that dies halfway is worse than one that's short.
 */
export function collectionZipEntries(collection: Collection): ArtworkListing[] {
  return collectionArtworks(collection)
    .filter((a) => a.variantWidths?.includes(ZIP_VARIANT_WIDTH))
    .slice(0, ZIP_MAX_ENTRIES);
}

/** True when the cap actually bit, i.e. the ZIP is a subset of the set. */
export function isCollectionCapped(collection: Collection): boolean {
  return collectionArtworks(collection).length > ZIP_MAX_ENTRIES;
}

/** Filename for an artwork inside a collection ZIP. Numbered so the
 *  archive unpacks in plate order regardless of the viewer's sort. */
export function zipEntryName(art: ArtworkListing, index: number): string {
  const n = String(index + 1).padStart(3, "0");
  const stem = slugify(art.englishTitle ?? art.title) || "plate";
  return `${n}-${stem.slice(0, 80)}.avif`;
}

/** The set an ingest folder belongs to, or null for the general
 *  `collection-of-beauty` grab-bag (which isn't a published series and so
 *  isn't offered as an archive). */
export function collectionForFolder(folder: string): Collection | null {
  return COLLECTIONS.find((c) => c.folder === folder) ?? null;
}
