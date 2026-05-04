import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { VARIANT_WIDTHS } from "./variant-config.mjs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping NFKD combining marks is the intent
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
  );
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

export function assetUrl(objectKey: string): string {
  return `${ASSETS_BASE_URL}/${encodePath(objectKey.split("/"))}`;
}

// Variants live at <bucket>/<basename>/<width>.<format>, where <basename>
// is the original filename minus its extension. Example:
//   objectKey = "collection-of-beauty/Dong_Yuan_Mountain_Hall.jpg"
//   width=960, format="avif"
//   → "<base>/collection-of-beauty/Dong_Yuan_Mountain_Hall/960.avif"
export function variantUrl(objectKey: string, width: number, format: VariantFormat): string {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return `${ASSETS_BASE_URL}/${encodePath(segments)}`;
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
  return widths.map((w) => `${variantUrl(objectKey, w, format)} ${w}w`).join(", ");
}
