import { type Artist, type Artwork, artworkAlt, artworks, summary } from "@/lib/data";
import { assetUrl, variantUrl } from "@/lib/utils";
import type { Metadata } from "next";

// ────────────────────────────────────────────────────────────────────────────
// Identity
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical origin for absolute URLs in metadata, sitemaps, and JSON-LD.
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL (explicit, preferred in prod)
 *   2. VERCEL_PROJECT_PRODUCTION_URL (Vercel's prod alias, set automatically)
 *   3. VERCEL_URL (the current deployment's generated URL — preview builds)
 *   4. Hardcoded fallback so local dev, docker, and tests don't crash.
 */
export const SITE_URL: string = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const anyVercel = process.env.VERCEL_URL;
  if (anyVercel) return `https://${anyVercel}`;
  return "http://localhost:3547";
})();

export const SITE_NAME = "Collection of Beauty";

export const SITE_TAGLINE =
  "A personal gallery of paintings, prints, and natural-history illustrations from the public domain.";

export const SITE_DESCRIPTION =
  `${summary.totalArtworks.toLocaleString()} works by ${summary.totalArtists.toLocaleString()} artists ` +
  `across ${summary.totalMovements} movements, spanning ${summary.yearRange.min}–${summary.yearRange.max}. ` +
  `Every piece in the public domain or openly licensed, sourced from Wikimedia Commons and presented in a ` +
  `gallery, timeline, artist-lineage graph, and virtual 3D room.`;

export const TWITTER_HANDLE = process.env.NEXT_PUBLIC_TWITTER_HANDLE ?? undefined;

// ────────────────────────────────────────────────────────────────────────────
// Hero picker — a single well-known artwork used as the OG image on pages
// that don't have their own subject (home, timeline, lineage, artists, 3D).
// Deterministic so social cache doesn't flap between deploys.
// ────────────────────────────────────────────────────────────────────────────

const HERO_ID_PATTERNS = [
  /starry-night/i, // Vincent van Gogh — universal recognition
  /great-wave|kanagawa/i, // Hokusai fallback
  /water-lilies/i, // Monet fallback
];

let _cachedHero: Artwork | null | undefined;

export function heroArtwork(): Artwork {
  if (_cachedHero !== undefined) return _cachedHero ?? artworks[0];
  for (const pattern of HERO_ID_PATTERNS) {
    const hit = artworks.find((a) => pattern.test(a.id) && a.width && a.height);
    if (hit) {
      _cachedHero = hit;
      return hit;
    }
  }
  // Last-resort fallback: the first artwork with known dimensions.
  _cachedHero = artworks.find((a) => a.width && a.height) ?? artworks[0];
  return _cachedHero;
}

// ────────────────────────────────────────────────────────────────────────────
// OG image helpers
// ────────────────────────────────────────────────────────────────────────────

/** Clamp an artwork's dimensions to OG-friendly size without distorting aspect. */
function fitInto(
  width: number | null,
  height: number | null,
  maxWidth: number,
): { width: number; height: number } {
  const w = width ?? maxWidth;
  const h = height ?? Math.round(maxWidth * 0.75);
  if (w <= maxWidth) return { width: w, height: h };
  const scale = maxWidth / w;
  return { width: maxWidth, height: Math.round(h * scale) };
}

/**
 * Build the Open Graph `images` array for an artwork. We point at the
 * pre-built 1280-wide WebP variant (fast for social scrapers) and include
 * the original JPEG as a secondary fallback for picky crawlers.
 */
export function ogImagesForArtwork(artwork: Artwork): NonNullable<Metadata["openGraph"]>["images"] {
  const { width, height } = fitInto(artwork.width, artwork.height, 1280);
  const alt = artworkAlt(artwork);
  return [
    {
      url: variantUrl(artwork.objectKey, 1280, "webp"),
      width,
      height,
      alt,
      type: "image/webp",
    },
    {
      url: assetUrl(artwork.objectKey),
      alt,
    },
  ];
}

/** OG images for an artist, using their cover artwork if the object key is set. */
export function ogImagesForArtist(artist: Artist): NonNullable<Metadata["openGraph"]>["images"] {
  if (!artist.coverObjectKey) return ogImagesForArtwork(heroArtwork());
  const cover = artworks.find((a) => a.objectKey === artist.coverObjectKey);
  return cover ? ogImagesForArtwork(cover) : ogImagesForArtwork(heroArtwork());
}

// ────────────────────────────────────────────────────────────────────────────
// Absolute URL helpers (metadata + JSON-LD want fully-qualified URLs)
// ────────────────────────────────────────────────────────────────────────────

export function absoluteUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean}`;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

// ────────────────────────────────────────────────────────────────────────────
// JSON-LD structured data
// ────────────────────────────────────────────────────────────────────────────

/**
 * schema.org/VisualArtwork for an individual artwork page. Google uses this
 * for rich image results and art panels.
 */
export function artworkJsonLd(artwork: Artwork): Record<string, unknown> {
  const imageUrl = variantUrl(artwork.objectKey, 1280, "webp");
  return {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: artwork.title,
    ...(artwork.artist
      ? {
          creator: {
            "@type": "Person",
            name: artwork.artist,
            ...(artwork.artistSlug ? { url: absoluteUrl(`/artist/${artwork.artistSlug}`) } : {}),
          },
        }
      : {}),
    ...(artwork.dateCreated ? { dateCreated: artwork.dateCreated } : {}),
    ...(artwork.description ? { description: artwork.description } : {}),
    image: [imageUrl, assetUrl(artwork.objectKey)],
    url: absoluteUrl(`/artwork/${artwork.id}`),
    ...(artwork.realDimensions
      ? {
          width: {
            "@type": "QuantitativeValue",
            unitCode: "CMT",
            value: artwork.realDimensions.widthCm,
          },
          height: {
            "@type": "QuantitativeValue",
            unitCode: "CMT",
            value: artwork.realDimensions.heightCm,
          },
        }
      : {}),
    ...(artwork.movement ? { artMovement: artwork.movement } : {}),
    license: "https://creativecommons.org/publicdomain/mark/1.0/",
    creditText: artwork.credit ?? "Wikimedia Commons",
    isAccessibleForFree: true,
    isFamilyFriendly: true,
    copyrightNotice: artwork.license,
  };
}

/** schema.org/Person for an artist page. */
export function artistJsonLd(artist: Artist): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: artist.name,
    ...(artist.born ? { birthDate: String(artist.born) } : {}),
    ...(artist.died ? { deathDate: String(artist.died) } : {}),
    ...(artist.nationality ? { nationality: artist.nationality } : {}),
    ...(artist.movement ? { knowsAbout: artist.movement } : {}),
    ...(artist.coverObjectKey ? { image: variantUrl(artist.coverObjectKey, 1280, "webp") } : {}),
    url: absoluteUrl(`/artist/${artist.slug}`),
  };
}

/** schema.org/WebSite for the root layout — helps Google understand the site. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url: SITE_URL,
    inLanguage: "en",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Tiny utility to render a JSON-LD script tag in JSX.
// Inlined here (rather than a component file) to keep SEO imports tidy.
// ────────────────────────────────────────────────────────────────────────────

export function jsonLdScriptProps(data: Record<string, unknown>): {
  type: "application/ld+json";
  dangerouslySetInnerHTML: { __html: string };
} {
  // Escape </script> inside the JSON to prevent XSS via string fields.
  const escaped = JSON.stringify(data).replace(/</g, "\\u003c");
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: escaped },
  };
}
