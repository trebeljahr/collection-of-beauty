import { displayTitle } from "@/lib/artwork-format";
import { artworks as ALL_ARTWORKS } from "@/lib/data";
import { publicVariantUrl } from "@/lib/utils";

/**
 * Hero image used in the double-opt-in confirmation email. One curated
 * pick — Friedrich's "The Monk by the Sea" — chosen because it's
 * recognisable, wide enough to crop into an email header, and lives in
 * the catalogue with a 1280-wide WebP variant available.
 *
 * Resolving at runtime against the catalogue means a slug rename in
 * `src/data/artworks.json` fails the request loudly instead of silently
 * shipping a broken hero image.
 */
const CONFIRM_HERO_ID =
  "collection-of-beauty-caspar-david-friedrich-der-monch-am-meer-google-art-project";

export type ConfirmHero = {
  imageUrl: string;
  artworkUrl: string;
  caption: string;
  alt: string;
};

export function resolveConfirmHero(siteUrl: string): ConfirmHero {
  const artwork = ALL_ARTWORKS.find((a) => a.id === CONFIRM_HERO_ID);
  if (!artwork) {
    throw new Error(`confirmation-cover: artwork "${CONFIRM_HERO_ID}" missing from catalogue`);
  }
  const title = displayTitle(artwork);
  const artistBit = artwork.artist ? `${artwork.artist}` : "Unknown artist";
  const yearBit = artwork.year ? ` · ${artwork.year}` : "";
  return {
    // 1280w WebP: readable on retina inboxes, supported by every modern
    // mail client, ~150–300 KB. AVIF skipped because Apple Mail still
    // can't decode it inline.
    imageUrl: publicVariantUrl(artwork.objectKey, 1280, "webp"),
    artworkUrl: `${siteUrl.replace(/\/$/, "")}/artwork/${artwork.id}`,
    caption: `${title} · ${artistBit}${yearBit}`,
    alt: `${title} — ${artistBit}`,
  };
}
