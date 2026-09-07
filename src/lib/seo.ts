import type { Metadata } from "next";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { type Artist, type Artwork, artworks, summary } from "@/lib/data";
import { WEBP_WIDTH } from "@/lib/downloads";
import { ERAS } from "@/lib/gallery-eras";
import { encodingFormat, licensableVariants } from "@/lib/licensable-images";
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

// Floor count and the era names at either end of the building are read
// from ERAS rather than written out, so adding a storey can't leave the
// site describing a museum it no longer is. ERAS is a plain data module
// (its only import of ./data is type-only, no three.js), so pulling it
// in here doesn't drag WebGL into anything that imports seo.ts.
const FLOOR_COUNT = ERAS.length;

/**
 * Short enough to sit in a <title> after the site name, and it leads with
 * the museum on purpose: "public-domain art gallery" describes several
 * hundred other sites, the walkable building describes this one.
 */
export const SITE_TAGLINE = `a walkable ${FLOOR_COUNT}-floor museum of public-domain art`;

// Kept under the ~155 characters Google shows before truncating; the
// longer version repeated the floor-by-floor description that already
// sits on /gallery-3d and /press.
export const SITE_DESCRIPTION =
  `A museum of ${FLOOR_COUNT} walkable floors, one per era. ` +
  `${summary.totalArtworks.toLocaleString()} public-domain works by ` +
  `${summary.totalArtists.toLocaleString()} artists, ${summary.yearRange.min}–${summary.yearRange.max}. ` +
  `Also a flat gallery and a timeline.`;

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
 * Build the Open Graph `images` array for an artwork: the pre-built
 * 1280-wide WebP variant, and only that one.
 *
 * WebP rather than AVIF because social scrapers and email clients still
 * have poor AVIF support, and WEBP_WIDTH because it is the ONLY WebP
 * width the pipeline builds — `FORMATS` in shrink-sources.mjs overrides the ladder
 * to `widths: [1280]` for WebP, one file per source instead of eight.
 * There used to be a second entry here at 640.webp, offered as "a smaller
 * secondary for crawlers that cap payload size"; that file has never
 * existed for any of the 4,571 works, so every artwork page shipped an
 * og:image that 404s. It stayed invisible because verify-r2's
 * `expectedKeysFor` checks the AVIF widths in `variantWidths` plus a
 * single 1280.webp, so the deploy gate never HEADs it. Adding a width
 * back here means adding it to FORMATS first.
 *
 * The entry must be a *variant*. Only `assets-web/` is synced to R2 and
 * shrink-sources.mjs never copies an original into it, so the original an
 * `assetUrl()` entry would point at isn't a servable URL — see the header
 * of scripts/verify-r2.mjs. It also emitted a duplicate og:image tag.
 */
export function ogImagesForArtwork(
  artwork: Artwork | null | undefined,
): NonNullable<Metadata["openGraph"]>["images"] {
  if (!artwork) return [];
  const large = fitInto(artwork.width, artwork.height, WEBP_WIDTH);
  return [
    {
      url: variantUrl(artwork.objectKey, WEBP_WIDTH, "webp"),
      width: large.width,
      height: large.height,
      alt: artworkAlt(artwork),
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
 *
 * A frame from the museum itself would be the stronger share card — it is
 * the one thing about this site a thumbnail can show that no other
 * public-domain gallery can — but the card has to be captured off a real
 * GPU, and `hero-3d-museum.png` is still listed as in production on
 * /press. Until it exists this stays the mosaic, so the alt text
 * describes the mosaic rather than repeating the site tagline: alt text
 * is a description of the image, and this image is not a museum.
 */
const SITE_OG_IMAGE = {
  url: absoluteUrl("/opengraph-image.png"),
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — a mosaic of six public-domain paintings beside the wordmark`,
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
  const license = getLicenseInfo(artwork.license);
  const detailUrl = absoluteUrl(`/artwork/${artwork.id}`);
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
    // Full ImageObject entries rather than bare URLs: Google's licensable
    // ("Free to use") badge in Google Images keys off contentUrl +
    // license + acquireLicensePage, and a plain string can't carry those.
    image: artworkImageObjects(artwork),
    url: detailUrl,
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
    creditText: creditTextFor(artwork),
    acquireLicensePage: detailUrl,
    isAccessibleForFree: true,
    isFamilyFriendly: true,
    copyrightNotice: artwork.license,
  };
}

/** `creditText` for an artwork — the supplied credit line, else the
 *  upstream source's display name. Shared by the VisualArtwork node and
 *  each nested ImageObject so the two can't disagree. */
function creditTextFor(artwork: Artwork): string {
  return artwork.credit ?? sourceLabel(artwork.commonsUrl);
}

/**
 * schema.org/ImageObject entries for an artwork's servable variants.
 *
 * These are what earn the "Free to use" badge in Google Images. Google's
 * licensable-image feature requires, per image:
 *   - `contentUrl` — the image file itself (required)
 *   - `license` — the licence deed the work is available under
 *   - `acquireLicensePage` — where a user goes to obtain/download it
 * `license` alone is enough to qualify, but a page carrying both is what
 * renders the full licence-details link, so we emit both.
 *
 * `creator` / `creditText` / `copyrightNotice` are recommended and cost
 * nothing here — the artwork record already has them.
 *
 * Every `contentUrl` comes from `licensableVariants()`, which derives the
 * set from the work's own `variantWidths` manifest. Nothing is emitted
 * for a file that wasn't encoded: an unfetchable contentUrl disqualifies
 * the image rather than merely being ignored.
 */
export function artworkImageObjects(artwork: Artwork): Record<string, unknown>[] {
  const license = getLicenseInfo(artwork.license);
  const detailUrl = absoluteUrl(`/artwork/${artwork.id}`);
  const credit = creditTextFor(artwork);
  const caption = artworkAlt(artwork);
  const creator = artwork.artist
    ? {
        "@type": "Person",
        name: artwork.artist,
        ...(artwork.artistSlug ? { url: absoluteUrl(`/artist/${artwork.artistSlug}`) } : {}),
      }
    : undefined;

  return licensableVariants(artwork).map((variant, index) => ({
    "@type": "ImageObject",
    contentUrl: variantUrl(artwork.objectKey, variant.width, variant.format),
    // The licence deed and the page a visitor licenses/downloads from.
    // Both are what Google reads for the licensable badge.
    license: license.url,
    acquireLicensePage: detailUrl,
    creditText: credit,
    ...(creator ? { creator } : {}),
    copyrightNotice: artwork.license,
    isAccessibleForFree: true,
    caption,
    encodingFormat: encodingFormat(variant.format),
    // Pixel dimensions of the encoded file, omitted when the source
    // dimensions are unknown rather than guessed.
    //
    // QuantitativeValue rather than a bare number: schema.org types
    // MediaObject.width/height as Distance or QuantitativeValue, and a
    // plain integer is the same out-of-range shape that got
    // `"nationality": "Italian"` rejected below. E37 is UN/CEFACT for
    // "pixel", the counterpart of the CMT the VisualArtwork uses for the
    // physical canvas.
    ...(variant.pixelWidth && variant.pixelHeight
      ? {
          width: { "@type": "QuantitativeValue", unitCode: "E37", value: variant.pixelWidth },
          height: { "@type": "QuantitativeValue", unitCode: "E37", value: variant.pixelHeight },
        }
      : {}),
    // The first entry is the page's own <img src>; the rest are larger
    // srcSet rungs of the same picture.
    ...(index === 0 ? { representativeOfPage: true } : {}),
  }));
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

/**
 * schema.org/CreativeWorkSeries for a plate set.
 *
 * A plate set is a published book, so the series type carries the facts
 * that matter — author, publication span, and the number of plates it
 * contains — in a way a bare CollectionPage cannot. `hasPart` lists the
 * plates as VisualArtwork nodes, capped: the full 435 Audubon entries
 * would bloat the document well past what a crawler will usefully read,
 * and every plate has its own indexable page carrying its own full
 * VisualArtwork anyway. `numberOfItems` states the true total so the cap
 * can't be mistaken for the extent.
 */
export function plateSetJsonLd(input: {
  id: string;
  title: string;
  author: string;
  authorSlug: string;
  publishedLabel: string;
  publishedFrom: number;
  publishedTo: number;
  description: string;
  presentCount: number;
  parts: { id: string; name: string; objectKey: string; position: number }[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWorkSeries",
    name: input.title,
    description: input.description,
    url: absoluteUrl(`/collection/${input.id}`),
    creator: {
      "@type": "Person",
      name: input.author,
      url: absoluteUrl(`/artist/${input.authorSlug}`),
    },
    // schema.org wants an ISO 8601 date here — the display label is a
    // range with an en dash and would be rejected. The span goes in
    // temporalCoverage, which does take an ISO interval.
    datePublished: String(input.publishedFrom),
    ...(input.publishedTo !== input.publishedFrom
      ? { temporalCoverage: `${input.publishedFrom}/${input.publishedTo}` }
      : {}),
    inLanguage: "en",
    isAccessibleForFree: true,
    numberOfItems: input.presentCount,
    hasPart: input.parts.map((part) => ({
      "@type": "VisualArtwork",
      position: part.position,
      name: part.name,
      url: absoluteUrl(`/artwork/${part.id}`),
      image: variantUrl(part.objectKey, 1280, "webp"),
      creator: { "@type": "Person", name: input.author },
    })),
  };
}

/** schema.org/CollectionPage for the /collections index. */
export function collectionsIndexJsonLd(
  sets: { id: string; title: string; tagline: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Complete plate sets · ${SITE_NAME}`,
    url: absoluteUrl("/collections"),
    isAccessibleForFree: true,
    hasPart: sets.map((set) => ({
      "@type": "CreativeWorkSeries",
      name: set.title,
      description: set.tagline,
      url: absoluteUrl(`/collection/${set.id}`),
    })),
  };
}

/** schema.org/WebSite for the root layout — helps Google understand the site. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
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
