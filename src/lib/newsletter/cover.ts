import { artworks as ALL_ARTWORKS, type Artwork } from "@/lib/data";
import { variantUrl } from "@/lib/utils";
import type { Edition } from "./types";

export type ResolvedCover = {
  /** Absolute URL to a 1280w webp image suitable for OG + email + thumbnails. */
  url: string;
  alt: string;
  /** Artwork backing the cover, when applicable — useful for the archive card to link to the source. */
  artwork: Artwork | null;
};

/**
 * Resolve an edition's cover into a concrete URL + alt. Resolution order:
 *
 *   1. Explicit `cover: { artworkId, alt? }` in frontmatter.
 *   2. Explicit `cover: { src, alt }` in frontmatter.
 *   3. Fallback to the first artwork in the issue's `artworks` array.
 *
 * Returns null only if the edition has no artworks at all (which the
 * parser already disallows, but the type system doesn't know that).
 */
export function resolveEditionCover(edition: Edition): ResolvedCover | null {
  const byId = new Map(ALL_ARTWORKS.map((a) => [a.id, a]));

  if (edition.cover && "src" in edition.cover) {
    return { url: edition.cover.src, alt: edition.cover.alt, artwork: null };
  }

  const candidateId =
    edition.cover && "artworkId" in edition.cover
      ? edition.cover.artworkId
      : edition.artworks[0]?.id;

  if (!candidateId) return null;
  const artwork = byId.get(candidateId);
  if (!artwork) {
    throw new Error(
      `Edition ${edition.fileSlug}: cover references unknown artwork id "${candidateId}".`,
    );
  }

  const explicitAlt = edition.cover && "artworkId" in edition.cover ? edition.cover.alt : undefined;
  const alt = explicitAlt ?? artworkAltLabel(artwork);

  return {
    url: variantUrl(artwork.objectKey, 1280, "webp"),
    alt,
    artwork,
  };
}

function artworkAltLabel(artwork: Artwork): string {
  const parts = [artwork.title];
  if (artwork.artist) parts.push(`by ${artwork.artist}`);
  if (artwork.year) parts.push(`(${artwork.year})`);
  return parts.join(" ");
}
