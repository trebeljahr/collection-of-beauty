import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

// Single URL for everything — the rclone HTTP server. Serves both:
//   - Originals at      <bucket>/<filename>.<ext>   (download links only)
//   - Pre-built variants at <bucket>/<basename>/<width>.<avif|webp>
//     (emitted by scripts/shrink-sources.mjs, consumed by <ResponsiveImage>)
// There is no longer a separate ORIGIN_URL — all image fetching is
// browser-direct, Next.js is no longer in the image pipeline.
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "http://localhost:9100";

// Variant set emitted by shrink-sources.mjs. The script hardcodes the same
// list — keep them in sync. Chosen to cover typical responsive breakpoints
// (mobile, tablet, desktop, 4K) plus a small thumb size.
export const VARIANT_WIDTHS = [256, 480, 640, 960, 1280, 1920, 2560] as const;

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
export function variantUrl(
  objectKey: string,
  width: number,
  format: VariantFormat,
): string {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return `${ASSETS_BASE_URL}/${encodePath(segments)}`;
}

// Full srcSet string for a <source> element. Always emits every width —
// shrink-sources.mjs writes a file for each width (Sharp uses
// withoutEnlargement so small sources get re-encoded at their native size,
// but the file still exists at every URL).
export function variantSrcSet(
  objectKey: string,
  format: VariantFormat,
): string {
  return VARIANT_WIDTHS
    .map((w) => `${variantUrl(objectKey, w, format)} ${w}w`)
    .join(", ");
}
