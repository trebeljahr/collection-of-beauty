// Variant ladder for the image shrink pipeline. Single source of truth
// shared between:
//   - scripts/shrink-sources.mjs (build-time encoder — emits these widths)
//   - src/lib/utils.ts            (runtime URL builder — references them)
//
// Lives as `.mjs` so Node can import it natively from the build script
// without transpilation, and Next.js's bundler resolves it from the
// runtime side via "moduleResolution": "bundler". Earlier this list
// was duplicated in both files with hand-kept "keep in sync" comments,
// which is exactly the kind of drift waiting to happen.

/** Pre-built widths in the responsive ladder. The 4096 px width is for
 *  the 3D gallery's close-up LOD; the responsive `<picture>` tops out
 *  at 2560 px. */
export const VARIANT_WIDTHS = [256, 480, 640, 960, 1280, 1920, 2560, 4096];

/** Long-side cap for the per-source full-resolution AVIF (only emitted
 *  when the source is bigger than the standard ladder's max). 16384
 *  is libheif's encoder limit — sources that exceed it scale down
 *  proportionally. Also a safe upper bound for typical GPU
 *  MAX_TEXTURE_SIZE. */
export const FULL_SIZE_MAX = 16384;
