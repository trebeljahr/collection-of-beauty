// Variant ladder for the image shrink pipeline. Single source of truth
// shared between:
//   - scripts/shrink-sources.mjs (build-time encoder — emits these widths)
//   - src/lib/utils.ts            (runtime URL builder — references them)
//   - src/lib/deep-zoom-config.mjs (tile availability — see FULL_SIZE_MIN_WIDTH)
//
// Lives as `.mjs` so Node can import it natively from the build script
// without transpilation, and Next.js's bundler resolves it from the
// runtime side via "moduleResolution": "bundler". Earlier this list
// was duplicated in both files with hand-kept "keep in sync" comments,
// which is exactly the kind of drift waiting to happen.

/** Pre-built widths in the responsive ladder. The 4096 px width is for
 *  the 3D gallery's close-up LOD; the responsive `<picture>` tops out
 *  at 2560 px.
 *
 *  Every width here is emitted UNCONDITIONALLY for every source.
 *  `shrink-sources.mjs` clamps the pixels but not the filename
 *  (`targetW = Math.min(rung, sourceWidth)` with `withoutEnlargement`),
 *  so a 1,807 px scan still gets a file called `4096.avif` holding an
 *  1,807 px image. Two consequences that bite anyone editing this array:
 *
 *    - `variantWidths` is a manifest of FILENAMES, not of resolutions.
 *      Anything sizing a decode or a texture from it must clamp against
 *      the artwork's own `width` (see `encodedSize()` in
 *      licensable-images.ts).
 *    - Adding a rung above 4096 here would give all ~4,570 works a
 *      mis-named copy of their largest real pixels, which would make
 *      `max(variantWidths)` exceed FULL_SIZE_MIN_WIDTH for the whole
 *      catalogue and hand a DZI pyramid to ~3,600 works that have none.
 *      That is why GALLERY_LOD_WIDTH below is deliberately NOT a member
 *      of this array. */
export const VARIANT_WIDTHS = [256, 480, 640, 960, 1280, 1920, 2560, 4096];

/** Long-side cap for the per-source full-resolution AVIF (only emitted
 *  when the source is bigger than the standard ladder's max). 16384
 *  is libheif's encoder limit — sources that exceed it scale down
 *  proportionally. Also a safe upper bound for typical GPU
 *  MAX_TEXTURE_SIZE. */
export const FULL_SIZE_MAX = 16384;

/** Sources whose full-size encode would come out wider than this get a
 *  per-source full-resolution AVIF on top of the standard ladder — and,
 *  because the tiler keys off exactly the same condition, a DZI pyramid.
 *
 *  This used to be spelled `Math.max(...VARIANT_WIDTHS)` inside
 *  shrink-sources.mjs, which silently made the ladder's top rung and the
 *  full-size/tile threshold the same number. They are different policies:
 *  the ladder max is "the biggest texture the 3D gallery uploads", this is
 *  "the point past which a single ladder rung stops representing the
 *  source". Growing the ladder must not move this, or every work whose
 *  source sits between the old and new max quietly loses both its
 *  full-size download and its tile pyramid — and the deep-zoom viewers
 *  degrade without erroring, so nobody would notice.
 *
 *  `deep-zoom-config.mjs` imports this as TILE_MIN_WIDTH rather than
 *  re-pinning the literal, so the two can never drift again. */
export const FULL_SIZE_MIN_WIDTH = 4096;

/** Extra close-up rung for the 3D gallery, emitted per source and ONLY
 *  when that source already has a strictly larger full-size rung
 *  (`fullW > GALLERY_LOD_WIDTH` in shrink-sources.mjs's `variantPaths`).
 *
 *  Why it exists: the in-scene LOD ladder stops at 4096, but a player can
 *  walk to ~0.45 m from a 3 m canvas, where 4096 px is visibly soft. The
 *  next thing that exists on disk is the full-size AVIF — median ~11,000
 *  px / ~85 megapixels — which is a ~500 MB decode and unusable as a
 *  scene texture. 6144 is the rung in between.
 *
 *  Why it is NOT in VARIANT_WIDTHS (three independent reasons, each
 *  sufficient on its own):
 *
 *    1. Ladder rungs are emitted unconditionally, so 6144 would become a
 *       mis-named duplicate on every small source — see VARIANT_WIDTHS.
 *    2. It would move `Math.max(...VARIANT_WIDTHS)`, which is also
 *       `LADDER_MAX_WIDTH` in downloads.ts, changing `isFullSize`,
 *       `hasFullSizeDownload()` and the /downloads counts.
 *    3. It would make 6144 the last entry of `variantWidths` for works
 *       whose real full-size rung is smaller (319 works have one between
 *       4096 and 6144), repointing `deepZoomSize()` at a pyramid geometry
 *       libvips never wrote. OpenSeadragon renders that as blank squares,
 *       not as an error.
 *
 *  The conditional gate buys back the invariant every reader depends on:
 *  because the rung only ever appears BELOW a larger full-size entry,
 *  the maximum of `variantWidths` is still either a ladder rung (<= 4096)
 *  or the full-size encode — never this. `max(variantWidths) >
 *  FULL_SIZE_MIN_WIDTH` therefore keeps meaning exactly what it means
 *  today, for exactly the same 968 works.
 *
 *  The gate is also what keeps the file honest at the encoder: it is
 *  emitted from a fresh decode of the source (not from the shared
 *  intermediate buffer, which is capped at the ladder max and would
 *  upscale), and `fullW > 6144` is equivalent to `6144 * h / w < 16384`,
 *  so the encode can never breach libheif's dimension limit.
 *
 *  GPU cost, for whoever wires this into the LOD picker: 6144 x 4608
 *  decodes to ~145 MiB of RGBA plus mipmaps, which is 0.45 of
 *  HIRES_CACHE_BYTE_BUDGET (320 MiB) in texture-cache.ts — above both a
 *  one-third-of-pool cap and the existing OVERSIZED_ENTRY_RATIO of 0.4.
 *  A per-entry byte clamp admits this rung only on wide canvases unless
 *  the pool grows; that is a texture-cache decision, not a ladder one. */
export const GALLERY_LOD_WIDTH = 6144;
