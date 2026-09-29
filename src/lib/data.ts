import artistsJson from "@/data/artists.json";
import artworksJson from "@/data/artworks.json";
import connectionsJson from "@/data/connections.json";
import movementsJson from "@/data/movements.json";
import summaryJson from "@/data/summary.json";
import type { ColorBucketId } from "@/lib/color-buckets.mjs";
import { ARTIST_COVERS } from "@/lib/cover-picks";

export { artworkAlt, displayTitle } from "@/lib/artwork-format";

export type Provenance = {
  /** Wikidata QID for the painting itself (e.g. "Q12418" for Mona Lisa).
   *  Null when the local Commons file isn't the canonical wdt:P18 image
   *  on any Wikidata item. */
  wikidataId: string | null;
  wikidataUrl: string | null;
  /** P195 — institution that owns the work. For a print, whose Wikidata
   *  item lists every impression, this and the next three fields describe
   *  the impression in the scanned file, and are null when that can't be
   *  told. See scripts/lib/provenance-impression.mjs. */
  collection: string | null;
  collectionWikidataId: string | null;
  /** P276 — the collection itself, a room or building in it, or its town. */
  location: string | null;
  /** P217 — accession / inventory number in `collection`. */
  inventory: string | null;
  /** P973 — canonical museum page for the work. Never another
   *  impression's museum. */
  describedAt: string | null;
  /** Resolved [N] footnote URLs scraped from the Commons file page,
   *  capped at 4. Useful as a "see also" list when there's no Wikidata
   *  describedAt URL. */
  sourceLinks: { label: string; url: string }[];
};

export type Artwork = {
  id: string;
  title: string;
  /** Curator-supplied English title used in preference to `title` when the
   *  source title is romaji/native script or a non-Latin original (e.g.
   *  "Tabi miyage dai sanshū" → "Souvenirs of Travel III: Tazawako
   *  Gozanoishi"). Populated from `metadata/title-overrides.json` keyed
   *  by `<folder>/<filename>`. */
  englishTitle: string | null;
  artist: string | null;
  artistSlug: string;
  year: number | null;
  dateCreated: string | null;
  /** Raw non-Gregorian date string before `scripts/clean-japanese-dates.mjs`
   *  rewrote it (e.g. "大正15年出版" for the cleaned "1926"). Preserved for
   *  transparency on the artwork detail page; null when no conversion
   *  happened. Loaded from `metadata/date-originals.json`. */
  originalDateString: string | null;
  description: string | null;
  folder: string;
  objectKey: string;
  width: number | null;
  height: number | null;
  realDimensions: {
    widthCm: number;
    heightCm: number;
    /** Where the numbers came from; `trustworthyRealSize()` in
     *  `real-size.ts` decides per source whether they describe the image.
     *  - wikidata: P2049 × P2048 on the painting's item.
     *  - wikimedia-template / wikimedia-template-mm: the Commons file
     *    page's dimensions field; `-mm` means build-data divided a value
     *    over 400 cm by 10, which it does on Google Art Project files only.
     *  - static: one sheet size per book (Audubon, Redouté, Haeckel).
     *  - series-default: a Japanese print format (ōban ≈ 24 × 36), not a
     *    measurement of the print.
     *  - museum / commons / wikipedia: researched from a collection page,
     *    the Commons file page, or a Wikipedia infobox (10108cf).
     *  - curated: a researched correction for a crop, multi-panel or
     *    mis-resolved value (ce62de1). */
    source:
      | "wikidata"
      | "wikimedia-template"
      | "wikimedia-template-mm"
      | "static"
      | "series-default"
      | "museum"
      | "commons"
      | "wikipedia"
      | "curated";
  } | null;
  /** Widths (in px) for which a pre-built variant exists under
   *  assets-web/<folder>/<basename>/<width>.{avif,webp}. Emitted by
   *  `pnpm assets:build-data` at build time; consumers use it to avoid
   *  attempting fetches for variants that don't exist yet. `null` when
   *  nothing has been shrunk for this artwork. */
  variantWidths: number[] | null;
  /** Average RGB hex (e.g. "#a87b4f") of the artwork — used as a CSS
   *  background-color underneath each gallery tile so slow mobile
   *  connections show a tinted block in the correct aspect ratio while
   *  the AVIF variant downloads. Extracted from the smallest pre-built
   *  variant (or the original) via `sharp().stats()` in build-data.
   *  Null when nothing on disk was readable at build time. */
  dominantColor: string | null;
  /** ThumbHash of the work (https://evanw.github.io/thumbhash/): ~20
   *  bytes of DCT coefficients, standard base64 *without* `=` padding
   *  (23-32 characters). Gallery tiles decode it into a blurred preview
   *  of the actual picture that paints over `dominantColor` until the
   *  variant arrives — the flat average says "brownish", the preview
   *  says "that Rembrandt". Encoded by `pnpm assets:build-data` from the
   *  same smallest variant `dominantColor` reads. Null under the same
   *  contract as `dominantColor`: nothing on disk was readable.
   *
   *  Decoded only in client components, by `src/lib/thumbhash-grid.ts`,
   *  so the ~240-character data URL never enters the RSC payload. The
   *  lightbox catalogue endpoints strip it to save response bytes.
   *  `/api/artworks/museum` retains it for instant 3D painting previews.
   *  See `catalogueListings`. */
  thumbHash: string | null;
  /** Colour families this work reads as, best-first (e.g.
   *  `["blue", "gold"]`), drawn from the ids in
   *  `src/lib/color-buckets.mjs`. Powers the browse-by-colour filter.
   *
   *  Deliberately NOT derived from `dominantColor` — that average
   *  collapses almost the whole corpus into one warm wedge. These come
   *  from a pixel histogram of the smallest pre-built variant, computed
   *  by `pnpm assets:build-data`. Null when nothing on disk was readable
   *  at build time, same contract as `variantWidths`. */
  colorBuckets: ColorBucketId[] | null;
  /** How much of each listed family the work actually carries: the
   *  chroma-weighted fraction of the whole image, 0-1, keyed by the ids
   *  in `colorBuckets`. This is the "how red is it" number, as opposed to
   *  `colorBuckets`, which is the thresholded "is it red at all".
   *
   *  Deliberately absent from `ArtworkListing`: only server code orders
   *  by it, and a per-family map on every row would be pure weight in the
   *  RSC payload. Read it through `artwork-colors.ts` instead. Null when
   *  nothing on disk was readable at build time. */
  colorStrength: Partial<Record<ColorBucketId, number>> | null;
  fileUrl: string;
  commonsUrl: string;
  credit: string | null;
  license: string;
  movement: string | null;
  nationality: string | null;
  /** Real provenance from Wikidata + resolved Commons footnote URLs.
   *  Generated by `node scripts/fetch-provenance.mjs`; null when nothing
   *  was found. */
  provenance: Provenance | null;
};

export type Artist = {
  slug: string;
  name: string;
  born: number | null;
  died: number | null;
  nationality: string | null;
  movement: string | null;
  count: number;
  minYear: number | null;
  maxYear: number | null;
  coverFileUrl: string | null;
  coverObjectKey: string | null;
  coverTitle: string | null;
  /** variantWidths of the cover artwork — see Artwork.variantWidths. Null
   *  when the cover has no pre-built variants yet. */
  coverVariantWidths: number[] | null;
  /** CSS object-position for the square card crop, from ARTIST_COVERS in
   *  cover-picks.ts. Null means centred. */
  coverPosition: string | null;
  /** "contain" when the card shows the whole cover instead of cropping. */
  coverFit: "contain" | null;
  /** Width / height of the cover work, so the card can ask for a variant
   *  wide enough to fill its crop. Null when the dimensions are unknown. */
  coverAspect: number | null;
};

export type Connection = {
  source: string;
  target: string;
  label: string;
  kind: "known" | "movement";
};

export const artworks = artworksJson as Artwork[];
type ArtistRecord = Omit<Artist, "coverPosition" | "coverFit" | "coverAspect">;

const artworksById = new Map(artworks.map((a) => [a.id, a]));
const artworksByObjectKey = new Map(artworks.map((a) => [a.objectKey, a]));

function aspectOf(work: Artwork | undefined): number | null {
  return work?.width && work.height ? work.width / work.height : null;
}

/** Swap build-data's first-work cover for the hand-picked one, when the
 *  picked work is still catalogued under this artist. */
function withPickedCover(artist: ArtistRecord): Artist {
  const pick = ARTIST_COVERS[artist.slug];
  const work = pick ? artworksById.get(pick.id) : undefined;
  if (!pick || !work || work.artistSlug !== artist.slug) {
    const fallback = artist.coverObjectKey
      ? artworksByObjectKey.get(artist.coverObjectKey)
      : undefined;
    return { ...artist, coverPosition: null, coverFit: null, coverAspect: aspectOf(fallback) };
  }
  return {
    ...artist,
    coverFileUrl: work.fileUrl,
    coverObjectKey: work.objectKey,
    coverTitle: work.englishTitle ?? work.title,
    coverVariantWidths: work.variantWidths,
    coverPosition: pick.position ?? null,
    coverFit: pick.fit ?? null,
    coverAspect: aspectOf(work),
  };
}

export const artists: Artist[] = (artistsJson as ArtistRecord[]).map(withPickedCover);
export const movements = movementsJson as string[];
export const connections = connectionsJson as Connection[];

/** Slim projection of Artwork — the fields that listing pages, browsers,
 *  the timeline, the lightbox, and the 3D gallery actually read. The
 *  full Artwork (~3.4 MB / 1.15 KB per row across descriptions,
 *  provenance, credit, source URLs) was being serialised into the RSC
 *  payload on every home / timeline / gallery-3d visit because the
 *  client components took `Artwork[]`. Server pages should pass
 *  `artworkListings` to anything client; only the /artwork/[id] detail
 *  page (server component) still pulls the full record via
 *  getArtwork(). */
export type ArtworkListing = Pick<
  Artwork,
  | "id"
  | "title"
  | "englishTitle"
  | "artist"
  | "artistSlug"
  | "year"
  | "movement"
  | "nationality"
  | "objectKey"
  | "variantWidths"
  | "width"
  | "height"
  | "realDimensions"
  | "dominantColor"
  | "thumbHash"
  | "colorBuckets"
>;

/** An `ArtworkListing` as the full-catalogue endpoints serve it: without
 *  `thumbHash`. See `catalogueListings`. */
export type CatalogueListing = Omit<ArtworkListing, "thumbHash">;

const _artworkListings: ArtworkListing[] = (artworksJson as Artwork[]).map((a) => ({
  id: a.id,
  title: a.title,
  englishTitle: a.englishTitle,
  artist: a.artist,
  artistSlug: a.artistSlug,
  year: a.year,
  movement: a.movement,
  nationality: a.nationality,
  objectKey: a.objectKey,
  variantWidths: a.variantWidths,
  width: a.width,
  height: a.height,
  realDimensions: a.realDimensions,
  dominantColor: a.dominantColor,
  // `?? null` because a catalogue built before build-data encoded hashes
  // has no such key, and the listing contract is null, not undefined.
  thumbHash: a.thumbHash ?? null,
  colorBuckets: a.colorBuckets,
}));
export const artworkListings: ArtworkListing[] = _artworkListings;

/** Listings without `thumbHash`, memoised per source array. The arrays
 *  that reach here are shared caches (`orderedArtworkListings`' order
 *  cache, the timeline's dated list), so this copies rather than deleting
 *  in place, and keys the copy on the source's identity: a WeakMap lets a
 *  copy go once its source has been evicted.
 *
 *  Rows are memoised too. The order cache holds up to 64 arrays, most of
 *  them re-orderings of the same 4,557 listings; stripping each row per
 *  array would cost ~0.77 MB of heap per full-catalogue copy, where
 *  sharing the stripped rows leaves each copy an array of pointers. */
const withoutThumbHashCache = new WeakMap<readonly ArtworkListing[], CatalogueListing[]>();
const strippedRows = new WeakMap<ArtworkListing, CatalogueListing>();

function stripRow(row: ArtworkListing): CatalogueListing {
  let stripped = strippedRows.get(row);
  if (!stripped) {
    const { thumbHash: _thumbHash, ...rest } = row;
    stripped = rest;
    strippedRows.set(row, stripped);
  }
  return stripped;
}

export function withoutThumbHash(list: readonly ArtworkListing[]): CatalogueListing[] {
  const hit = withoutThumbHashCache.get(list);
  if (hit) return hit;
  const stripped = list.map(stripRow);
  withoutThumbHashCache.set(list, stripped);
  return stripped;
}

/** What `/api/artworks` serves: every listing, minus `thumbHash`. Its
 *  lightbox consumers do not display previews. The museum uses a
 *  separate endpoint that retains the hashes. Computed once for the
 *  static catalogue route. */
export const catalogueListings: CatalogueListing[] = withoutThumbHash(artworkListings);
export const summary = summaryJson as {
  totalArtworks: number;
  totalArtists: number;
  totalMovements: number;
  totalConnections: number;
  yearRange: { min: number | null; max: number | null };
};

export function getArtwork(id: string): Artwork | null {
  return artworks.find((a) => a.id === id) ?? null;
}

export function getArtist(slug: string): Artist | null {
  return artists.find((a) => a.slug === slug) ?? null;
}

export function getArtworksByArtist(slug: string): Artwork[] {
  return artworks.filter((a) => a.artistSlug === slug);
}

export function getConnectionsFor(slug: string): Connection[] {
  return connections.filter((c) => c.source === slug || c.target === slug);
}
