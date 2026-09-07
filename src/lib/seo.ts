import type { Metadata } from "next";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { type Artist, type Artwork, artworks, summary } from "@/lib/data";
import { getLicenseInfo } from "@/lib/license";
import { SITE_URL } from "@/lib/links";
import { sourceLabel } from "@/lib/source-label";
import { variantUrl } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Identity
// ────────────────────────────────────────────────────────────────────────────

// Canonical origin lives in @/lib/links so the suggest-fix URL builder can
// embed an absolute permalink without dragging seo.ts's full metadata + data
// imports into client bundles. Re-exported here for existing callers.
export { SITE_URL };

export const SITE_NAME = "Collection of Beauty";

export const SITE_TAGLINE =
  "A personal gallery of paintings, prints, and natural-history illustrations from the public domain.";

export const SITE_DESCRIPTION =
  `${summary.totalArtworks.toLocaleString()} works by ${summary.totalArtists.toLocaleString()} artists ` +
  `across ${summary.totalMovements} movements, spanning ${summary.yearRange.min}–${summary.yearRange.max}. ` +
  `Every piece in the public domain or openly licensed, sourced from Wikimedia Commons and presented in a ` +
  `gallery, timeline, and virtual 3D room.`;

export const TWITTER_HANDLE = process.env.NEXT_PUBLIC_TWITTER_HANDLE ?? undefined;

// ────────────────────────────────────────────────────────────────────────────
// Hero picker — a single well-known artwork used as the OG image on pages
// that don't have their own subject (home, timeline, artists, 3D).
// Deterministic so social cache doesn't flap between deploys.
// ────────────────────────────────────────────────────────────────────────────

const HERO_ID_PATTERNS = [
  /starry-night/i, // Vincent van Gogh — universal recognition
  /great-wave|kanagawa/i, // Hokusai fallback
  /water-lilies/i, // Monet fallback
];

let _cachedHero: Artwork | null | undefined;

export function heroArtwork(): Artwork | null {
  if (_cachedHero !== undefined) return _cachedHero;
  for (const pattern of HERO_ID_PATTERNS) {
    const hit = artworks.find((a) => pattern.test(a.id) && a.width && a.height);
    if (hit) {
      _cachedHero = hit;
      return hit;
    }
  }
  // Last-resort fallback: the first artwork with known dimensions.
  _cachedHero = artworks.find((a) => a.width && a.height) ?? artworks[0] ?? null;
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
 * pre-built 1280-wide WebP variant (fast for social scrapers) and add the
 * 640-wide one as a smaller secondary for crawlers that cap payload size.
 *
 * Both entries must be *variants*. The `assets-web/<folder>/<basename>/
 * <width>.{avif,webp}` ladder is complete; the originals are not — ~1,770
 * of them are missing from the bucket — so an "original JPEG fallback"
 * entry here 404s for a large share of the corpus, on top of emitting a
 * duplicate og:image tag.
 */
export function ogImagesForArtwork(
  artwork: Artwork | null | undefined,
): NonNullable<Metadata["openGraph"]>["images"] {
  if (!artwork) return [];
  const large = fitInto(artwork.width, artwork.height, 1280);
  const small = fitInto(artwork.width, artwork.height, 640);
  const alt = artworkAlt(artwork);
  return [
    {
      url: variantUrl(artwork.objectKey, 1280, "webp"),
      width: large.width,
      height: large.height,
      alt,
      type: "image/webp",
    },
    {
      url: variantUrl(artwork.objectKey, 640, "webp"),
      width: small.width,
      height: small.height,
      alt,
      type: "image/webp",
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

// ────────────────────────────────────────────────────────────────────────────
// Open Graph defaults
// ────────────────────────────────────────────────────────────────────────────

/**
 * The site-wide OG image, served by the `src/app/opengraph-image.png` file
 * convention at `/opengraph-image.png` (1200×630 mosaic composited by
 * scripts/build-marketing-images.mjs).
 */
const SITE_OG_IMAGE = {
  url: absoluteUrl("/opengraph-image.png"),
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

/**
 * Merge page-specific Open Graph fields onto the site-wide defaults.
 *
 * Next's metadata merge is shallow *per key*: a child page that exports
 * `openGraph: { title, description }` replaces the root layout's entire
 * openGraph object, silently dropping og:url, og:type, og:site_name and
 * og:image. Every page that wants its own OG title must therefore route
 * through this helper rather than writing a bare literal.
 *
 * `url` takes a site-relative path and is resolved through absoluteUrl(),
 * so callers can pass the exact same string they give to
 * `alternates.canonical` and the two can't drift apart.
 */
export function buildOpenGraph(
  overrides: NonNullable<Metadata["openGraph"]> & { url?: string },
): NonNullable<Metadata["openGraph"]> {
  const { url, ...rest } = overrides;
  return {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
    // Tolerate an already-absolute URL so a caller that passes one doesn't
    // silently emit `${SITE_URL}/https://…`.
    url: url === undefined ? SITE_URL : /^https?:\/\//.test(url) ? url : absoluteUrl(url),
    ...rest,
  } as NonNullable<Metadata["openGraph"]>;
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
  const license = getLicenseInfo(artwork.license);
  return {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: displayTitle(artwork),
    ...(artwork.englishTitle && artwork.englishTitle !== artwork.title
      ? { alternateName: artwork.title }
      : {}),
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
    // Both entries are variants. The variant ladder is complete for every
    // artwork; the originals are not — ~1,770 are missing from the bucket,
    // so the assetUrl() entry that used to sit here 404s for many works.
    image: [imageUrl, variantUrl(artwork.objectKey, 640, "webp")],
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
    license: license.url,
    creditText: artwork.credit ?? sourceLabel(artwork.commonsUrl),
    isAccessibleForFree: true,
    isFamilyFriendly: true,
    copyrightNotice: artwork.license,
  };
}

/**
 * schema.org/Person.nationality expects a Country node, not a demonym string
 * — Google's validator rejects `"nationality": "Italian"` with "Value of
 * unexpected type for nationality. Expected types: Country."
 *
 * Keys are the exact strings that appear in src/data/artists.json. Anything
 * unmapped — a region rather than a country ("Flemish", "Early
 * Netherlandish") or a compound ("Belgian / French") — deliberately has no
 * entry: an absent optional property is valid structured data, an invented
 * country is not. New data that introduces an unknown value falls through to
 * the same omission instead of reintroducing the error.
 */
const NATIONALITY_TO_COUNTRY: Record<string, string> = {
  American: "United States",
  Chinese: "China",
  Czech: "Czech Republic",
  Dutch: "Netherlands",
  English: "United Kingdom",
  French: "France",
  German: "Germany",
  Italian: "Italy",
  Japanese: "Japan",
  Korean: "South Korea",
  Norwegian: "Norway",
  Russian: "Russia",
  Spanish: "Spain",
};

/** schema.org/Person for an artist page. */
export function artistJsonLd(artist: Artist): Record<string, unknown> {
  const country = artist.nationality ? NATIONALITY_TO_COUNTRY[artist.nationality] : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: artist.name,
    ...(artist.born ? { birthDate: String(artist.born) } : {}),
    ...(artist.died ? { deathDate: String(artist.died) } : {}),
    ...(country ? { nationality: { "@type": "Country", name: country } } : {}),
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
