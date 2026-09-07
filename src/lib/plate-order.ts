import { type ArtworkListing, artworkListings, artworks } from "@/lib/data";
import { PLATE_SETS } from "@/lib/plate-set-definitions";

/**
 * Plate ordering for the four published sets.
 *
 * Kept in its own module because two consumers need it and neither can
 * import the other: `collections.ts` (the ZIP / downloads surface) and
 * `plate-sets.ts` (the editorial collection pages, which also reads
 * `collections.ts`). This one only reads the catalogue and the data-free
 * definitions, so it sits underneath both.
 *
 * The ordering itself is the printed plate number, recovered per set
 * from whatever source record carries it. Sorting these sets by title
 * — the previous approach — is alphabetical by subject, not plate
 * order: it opens The Birds of America on the American Avocet (plate
 * 318) rather than the Wild Turkey (plate 1).
 */

export type OrderedPlate = {
  listing: ArtworkListing;
  /** Printed plate number, or null when no source record carries one. */
  plateNumber: number | null;
};

function buildFolderOrder(folder: string): OrderedPlate[] {
  const definition = PLATE_SETS.find((d) => d.folder === folder);
  const listingById = new Map(artworkListings.map((l) => [l.id, l]));

  const plates: OrderedPlate[] = artworks
    .filter((a) => a.folder === folder)
    .flatMap((artwork) => {
      const listing = listingById.get(artwork.id);
      // artworkListings is a 1:1 projection of artworks, so this can't
      // miss — but skipping beats rendering a hole if that changes.
      if (!listing) return [];
      return [{ listing, plateNumber: definition?.resolvePlateNumber(artwork) ?? null }];
    });

  plates.sort(
    (a, b) =>
      (a.plateNumber ?? Number.MAX_SAFE_INTEGER) - (b.plateNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.listing.title.localeCompare(b.listing.title) ||
      a.listing.id.localeCompare(b.listing.id),
  );
  return plates;
}

const cache = new Map<string, OrderedPlate[]>();

/** Every plate in a folder, in printed plate order. Memoised — the sort
 *  is deterministic, so it is paid once per server instance. */
export function plateOrderForFolder(folder: string): OrderedPlate[] {
  const hit = cache.get(folder);
  if (hit) return hit;
  const built = buildFolderOrder(folder);
  cache.set(folder, built);
  return built;
}
