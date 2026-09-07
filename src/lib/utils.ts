import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { TILE_DIR, TILE_FORMAT } from "./deep-zoom-config.mjs";
import { VARIANT_WIDTHS } from "./variant-config.mjs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// Base for all asset URLs. Serves both:
//   - Originals at      <base>/<bucket>/<filename>.<ext>   (download links only)
//   - Pre-built variants at <base>/<bucket>/<basename>/<width>.<avif|webp>
//     (emitted by scripts/shrink-sources.mjs, consumed by <ResponsiveImage>)
//
// Production: NEXT_PUBLIC_ASSETS_BASE_URL points at the CDN (absolute).
// Dev: returns the same-origin path "/assets-raw", which next.config.mjs
// rewrites to the local rclone server. The same-origin path keeps things
// working when the dev server is hit over LAN (a phone at
// 192.168.x.y:3000 doesn't have the rclone server on its OWN localhost
// — it has it on the dev machine's localhost, reachable only by going
// back through the dev server). Letting the dev server do the proxy
// makes asset URLs follow the page wherever the browser ends up
// connecting from.
function assetsBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_ASSETS_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_ASSETS_BASE_URL must be set in production.");
  }
  return "/assets-raw";
}

const ASSETS_BASE_URL = assetsBaseUrl();
const ASSETS_PROXY_BASE_URL = "/assets-raw";
const DEFAULT_PUBLIC_ASSETS_BASE_URL = "https://assets.beauty.trebeljahr.com";

// Variant set is shared from `variant-config.mjs` so the encoder
// (scripts/shrink-sources.mjs) and this runtime URL builder reference
// the same array — they used to be duplicated with hand-kept "keep in
// sync" comments. Chosen to cover typical responsive breakpoints
// (mobile, tablet, desktop, 4K) plus a small thumb size. The 4096 px
// variant is for the 3D gallery's close-up LOD only; sources smaller
// than 4096 px just don't generate that file.
export { VARIANT_WIDTHS } from "./variant-config.mjs";

export type VariantFormat = "avif" | "webp";

function encodePath(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

// Guards below return empty string when `objectKey` is missing/empty.
// The data type says `Artwork.objectKey: string`, but the JSON is
// generated and can in theory land here with a missing field; without
// a guard, `.lastIndexOf` / `.split` on null/undefined crashes the
// page. Empty src renders a broken image, which beats a hard crash.
export function assetUrl(objectKey: string): string {
  if (!objectKey) return "";
  return `${ASSETS_BASE_URL}/${encodePath(objectKey.split("/"))}`;
}

export function assetProxyUrl(objectKey: string): string {
  if (!objectKey) return "";
  return `${ASSETS_PROXY_BASE_URL}/${encodePath(objectKey.split("/"))}`;
}

// Variants live at <bucket>/<basename>/<width>.<format>, where <basename>
// is the original filename minus its extension. Example:
//   objectKey = "collection-of-beauty/Dong_Yuan_Mountain_Hall.jpg"
//   width=960, format="avif"
//   → "<base>/collection-of-beauty/Dong_Yuan_Mountain_Hall/960.avif"
export function variantUrl(objectKey: string, width: number, format: VariantFormat): string {
  if (!objectKey) return "";
  return `${ASSETS_BASE_URL}/${variantPath(objectKey, width, format)}`;
}

// Width used for the `<img>` fallback inside every <picture>. Deliberate
// on both axes:
//   - format: 1280 is the only width scripts/shrink-sources.mjs still
//     encodes as WebP (FORMATS there caps the webp entry at [1280]),
//     and WebP shipped years before AVIF in every engine — so the
//     clients that skip the AVIF <source> (pre-Safari-16.4 browsers,
//     most crawlers) can actually decode what they get.
//   - size: mid-ladder. The fallback is fetched by exactly the clients
//     we know least about, so it must not be the 2560/4096 rung — those
//     are multi-megabyte downloads for what is often a grid thumbnail.
export const FALLBACK_VARIANT_WIDTH = 1280;

// A variant URL that is known to exist, for use as the `<img src>`
// fallback. Only `assets-web/` is mirrored to the bucket and
// shrink-sources.mjs never puts an original in there, so `assetUrl()`
// does not resolve — the originals that *do* answer are strays from an
// older pipeline, not a contract. Pointing the fallback at one produced
// ~1.8k broken images in the crawl.
//
// `variantWidths` is the artwork's manifest (Artwork.variantWidths).
// When it's missing we assume the standard ladder rather than reaching
// for the original: the ladder is what any shrunk artwork has, while the
// original isn't served at all, so guessing the ladder is the only
// useful bet for an artwork whose manifest hasn't been regenerated yet.
export function fallbackVariantUrl(
  objectKey: string,
  variantWidths?: readonly number[] | null,
): string {
  if (!objectKey) return "";
  const { width, format } = fallbackVariant(variantWidths);
  return variantUrl(objectKey, width, format);
}

/**
 * The (width, format) pair `fallbackVariantUrl` resolves to, without
 * building the URL. Split out so structured data and the image sitemap
 * can advertise *the same* variant the page's `<img src>` actually
 * loads — if the JSON-LD `contentUrl` and the rendered `<img>` disagree,
 * Google has no way to attach the licence metadata to the image it
 * crawled, which is the whole point of the markup.
 */
export function fallbackVariant(variantWidths?: readonly number[] | null): {
  width: number;
  format: VariantFormat;
} {
  const widths = variantWidths && variantWidths.length > 0 ? variantWidths : VARIANT_WIDTHS;
  if (widths.includes(FALLBACK_VARIANT_WIDTH)) {
    return { width: FALLBACK_VARIANT_WIDTH, format: "webp" };
  }
  // No 1280 rung means no WebP at all for this artwork (the encoder
  // emits WebP at that width only), so serve the nearest AVIF rather
  // than a URL we already know is missing.
  const nearest = widths.reduce((best, w) =>
    Math.abs(w - FALLBACK_VARIANT_WIDTH) < Math.abs(best - FALLBACK_VARIANT_WIDTH) ? w : best,
  );
  return { width: nearest, format: "avif" };
}

function publicAssetsBaseUrl(): string {
  const explicit = process.env.NEWSLETTER_ASSETS_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const browserBase = process.env.NEXT_PUBLIC_ASSETS_BASE_URL;
  if (browserBase && isPublicHttpsUrl(browserBase)) {
    return browserBase.replace(/\/$/, "");
  }

  return DEFAULT_PUBLIC_ASSETS_BASE_URL;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function variantPath(objectKey: string, width: number, format: VariantFormat): string {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return encodePath(segments);
}

export function publicVariantUrl(objectKey: string, width: number, format: VariantFormat): string {
  if (!objectKey) return "";
  return `${publicAssetsBaseUrl()}/${variantPath(objectKey, width, format)}`;
}

export function variantProxyUrl(objectKey: string, width: number, format: VariantFormat): string {
  if (!objectKey) return "";
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return `${ASSETS_PROXY_BASE_URL}/${encodePath(segments)}`;
}

// Full srcSet string for a <source> element. Emits only the widths the
// caller knows exist on disk (the `variantWidths` manifest from
// build-data.mjs). Emitting widths that aren't present makes the browser
// 404 for every unmatched candidate, which shows as broken images in
// dev and spams the console in prod.
export function variantSrcSet(
  objectKey: string,
  format: VariantFormat,
  widths: readonly number[] = VARIANT_WIDTHS,
): string {
  if (!objectKey) return "";
  return widths.map((w) => `${variantUrl(objectKey, w, format)} ${w}w`).join(", ");
}

// Deep-zoom tile URL: <base>/<bucket>/<basename>/tiles/<level>/<col>_<row>.webp
//
// Same addressing scheme as variantUrl(), one directory deeper. Emitted by
// scripts/build-tiles.mjs; the level/col/row triple comes from
// OpenSeadragon, which derives it from the pyramid dimensions that
// deepZoomSize() computes — so the build script and the viewer agree on
// the tile grid without the pyramid shipping a .dzi manifest to describe
// itself.
//
// Deliberately the CDN URL, not the same-origin /assets-raw rewrite the 3D
// gallery uses: a deep-zoom session pulls hundreds of tiles, and routing
// those through the Next server would put the whole pyramid on the app
// container's egress path. OpenSeadragon only ever draws tiles (never
// reads pixels back), so a cross-origin canvas taint costs us nothing.
export function deepZoomTileUrl(
  objectKey: string,
  level: number,
  col: number,
  row: number,
): string {
  if (!objectKey) return "";
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, TILE_DIR, String(level)];
  return `${ASSETS_BASE_URL}/${encodePath(segments)}/${col}_${row}.${TILE_FORMAT}`;
}
