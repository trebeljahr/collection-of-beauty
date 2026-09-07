#!/usr/bin/env node
/*
 * Build pre-resized AVIF + WebP variants from originals, keeping
 * originals untouched. These variants are served directly by rclone
 * and referenced by <ResponsiveImage>'s <picture>/<source> — Next's
 * image optimizer is out of the hot path entirely.
 *
 *   assets/<bucket>/foo.jpg   (original, untouched)
 *         └──► assets-web/<bucket>/foo/<w>.avif
 *                where <w> ∈ [256, 480, 640, 960, 1280, 1920, 2560, 4096]
 *                (the standard ladder — every rung, every source)
 *              assets-web/<bucket>/foo/1280.webp
 *                (single width — OG meta + email clients that don't grok AVIF)
 *              assets-web/<bucket>/foo/<fullW>.avif
 *                (only when the full-size encode lands above
 *                 FULL_SIZE_MIN_WIDTH — full-resolution AVIF used by the
 *                 modal's deep zoom, so we never ship the raw JPEG; it is
 *                 also what marks the work as having a tile pyramid)
 *              assets-web/<bucket>/foo/6144.avif
 *                (only when <fullW> is STRICTLY LARGER than 6144 — the
 *                 3D gallery's close-up LOD rung, see GALLERY_LOD_WIDTH)
 *
 * So each source produces 9 variant files (8 AVIF + 1 WebP), plus a
 * full-size AVIF for sources beyond FULL_SIZE_MIN_WIDTH, plus a 6144
 * AVIF for the subset of those whose full-size rung clears 6144 (648 of
 * the ~4,570 catalogued works). For the full catalog that's ~46k files
 * totalling ~5-6 GB. Most files are tiny (10–600 KB) so serving is fast
 * and CDN-friendly.
 *
 * The ladder, FULL_SIZE_MAX, FULL_SIZE_MIN_WIDTH and GALLERY_LOD_WIDTH
 * are imported from src/lib/variant-config.mjs, shared with the runtime
 * URL builder in src/lib/utils.ts (and, for the threshold, with
 * deep-zoom-config.mjs) so the encoder and the runtime can never drift
 * apart on which widths exist or on which works have a pyramid.
 *
 * Idempotent: a source is skipped when every one of its PLANNED variant
 * files exists and has an mtime ≥ the source's. Note the all-or-nothing
 * granularity — adding one planned rung re-encodes that source's entire
 * set, full-size AVIF included. Drop a new original into assets/ and
 * re-run; only that file is processed.
 *
 * Performance: for each source we decode once into a bounded intermediate
 * pixel buffer (≤ LADDER_MAX_WIDTH on the width), then re-resize/re-encode
 * from that buffer for each ladder variant. This avoids one decode per
 * variant of the same (possibly huge) JPEG. The full-size and 6144 rungs
 * are the exceptions: both re-decode from the source, because the shared
 * intermediate has already thrown away the pixels they need.
 *
 * Parallelism: sharp.concurrency(1) pins each libvips op to one thread,
 * and we run --concurrency ops at once at the JS level. Default is
 * min(6, cores-2). Smallest-first order for fast early progress.
 *
 * Usage:
 *   node scripts/shrink-sources.mjs                     # build
 *   node scripts/shrink-sources.mjs --dry-run           # count + estimate
 *   node scripts/shrink-sources.mjs --folder=audubon-birds
 *   node scripts/shrink-sources.mjs --force             # rebuild everything
 *   node scripts/shrink-sources.mjs --concurrency=4
 */

import { mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  FULL_SIZE_MAX,
  FULL_SIZE_MIN_WIDTH,
  GALLERY_LOD_WIDTH,
  VARIANT_WIDTHS,
} from "../src/lib/variant-config.mjs";

// One libvips thread per op; parallelize at the JS level instead.
sharp.concurrency(1);
// Don't keep decoded pixel buffers between calls — avoids long-lived RAM
// occupation on the 700 MB Wikimedia scans.
sharp.cache(false);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "assets");
const DEST_ROOT = path.join(ROOT, "assets-web");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const DRY_RUN = args["dry-run"] === true;
const FORCE = args.force === true;
const CONCURRENCY = Number.parseInt(
  args.concurrency ?? String(Math.min(6, Math.max(2, os.cpus().length - 2))),
  10,
);
const FOLDERS = args.folder
  ? [args.folder]
  : ["collection-of-beauty", "audubon-birds", "kunstformen-images"];

// ─── Variant schema ────────────────────────────────────────────────────────
// Every constant here comes from src/lib/variant-config.mjs so this
// script, the runtime URL builder (src/lib/utils.ts) and the deep-zoom
// geometry (src/lib/deep-zoom-config.mjs) reference the same numbers.
// WIDTHS / LADDER_MAX_WIDTH are local aliases for readability.
//
// LADDER_MAX_WIDTH and FULL_SIZE_MIN_WIDTH are both 4096 today and used
// to be the same expression, `Math.max(...WIDTHS)`. They are now separate
// on purpose, because they answer different questions and only one of
// them is allowed to move when the ladder changes:
//
//   LADDER_MAX_WIDTH   — the widest rung emitted for EVERY source, and
//                        therefore the width of the shared intermediate
//                        decode buffer. A memory bound.
//   FULL_SIZE_MIN_WIDTH — the point past which a source earns a
//                        per-source full-resolution AVIF, which is also
//                        exactly the set of works that get a DZI tile
//                        pyramid (deep-zoom-config.mjs imports it as
//                        TILE_MIN_WIDTH). A policy threshold, and one
//                        that must stay pinned: raising it silently
//                        strips both the full-size download and the
//                        pyramid from every work in between, and the
//                        deep-zoom viewers degrade without erroring.
//
// Per-source full-resolution variant: sources whose full-size encode
// clears FULL_SIZE_MIN_WIDTH (Google Arts scans regularly hit 8–12k px,
// Prado gigapixel scans push 25–30k) get an extra AVIF on top of the
// standard ladder. Lets the modal's deep zoom show the full source
// resolution without falling back to shipping the original JPEG.
// Capped at FULL_SIZE_MAX on the LONG side to stay inside libheif's
// encoder limit (it rejects either dim > 16384 with "Processed image
// is too large for the HEIF format") and inside typical GPU
// MAX_TEXTURE_SIZE; oversize sources scale down proportionally and the
// runtime falls back to the raw asset for the (very few) cases that
// need more.
//
// GALLERY_LOD_WIDTH (6144): a close-up rung for the 3D gallery, sitting
// between the ladder's 4096 and the unusable ~85 MP full-size AVIF. NOT
// a ladder member — see the long comment in variant-config.mjs for the
// three ways that would break the catalogue.
const WIDTHS = VARIANT_WIDTHS;
const LADDER_MAX_WIDTH = Math.max(...WIDTHS);
// AVIF q=60 looks indistinguishable from q=85 JPEG but is ~3× smaller.
// WebP q=75 is the usual balance for photographs.
//
// effort tradeoff: libavif's encode time scales non-linearly with effort.
// effort=4 (Sharp default) vs effort=2 is ~2-3× faster with only 5-10%
// larger files — for a bulk pipeline with 42k outputs, that's tens of
// minutes saved for negligible bandwidth cost.
//
// Per-format `widths` override: AVIF is universally supported in modern
// browsers (Safari 16.4+, 2023), so we emit every srcSet width in AVIF.
// WebP is only kept at 1280w for OG meta images and email templates —
// social scrapers and email clients have poor AVIF support, but WebP
// works everywhere we care about. One WebP per source, not seven.
const FORMATS = [
  {
    ext: "avif",
    widths: WIDTHS,
    encode: (s) => s.avif({ quality: 60, effort: 2 }),
  },
  {
    ext: "webp",
    widths: [1280],
    encode: (s) => s.webp({ quality: 75, effort: 3 }),
  },
];

// Sharp handles all of these; anything else (pdf etc.) is skipped.
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

function fmt(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + " KB";
  return bytes + " B";
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

// Map a source path to its variant directory and expected variant files.
//   assets/<bucket>/<filename>.<ext>
//     → assets-web/<bucket>/<basename>/{<w>.<ext>}
//
// `sourceWidth`/`sourceHeight` (when known) control whether we plan a
// per-source full-size AVIF entry on top of the standard ladder. Pass
// 0 / null to skip it (caller doesn't have dimensions yet).
function variantPaths(folder, name, sourceWidth, sourceHeight) {
  const basename = path.basename(name, path.extname(name));
  const destDir = path.join(DEST_ROOT, folder, basename);
  const files = [];
  for (const f of FORMATS) {
    for (const w of f.widths) {
      files.push({
        width: w,
        format: f,
        path: path.join(destDir, `${w}.${f.ext}`),
      });
    }
  }
  // The full-size variant clamps the LONG side (not just width) to
  // FULL_SIZE_MAX, since libheif rejects either dim > 16384. For
  // portrait gigapixel scans (Prado, Whistler) this means the encoded
  // width can be smaller than sourceWidth — store the actual encoded
  // width in the filename so the runtime can address it directly. Skip
  // emission when the scaled width drops at or below FULL_SIZE_MIN_WIDTH
  // (extreme 1:4+ aspect ratios) — the standard ladder already covers it.
  const longSide = Math.max(sourceWidth || 0, sourceHeight || 0);
  if (longSide > FULL_SIZE_MIN_WIDTH) {
    const scale = Math.min(1, FULL_SIZE_MAX / longSide);
    const fullW = Math.round(sourceWidth * scale);
    if (fullW > FULL_SIZE_MIN_WIDTH) {
      files.push({
        width: fullW,
        format: FORMATS[0], // AVIF
        path: path.join(destDir, `${fullW}.avif`),
        isFullSize: true,
      });
      // The 3D gallery's close-up rung, emitted only when the full-size
      // rung is STRICTLY larger. Three things ride on that strictness:
      //
      //  - It keeps 6144 from ever becoming max(variantWidths), which is
      //    what `deepZoomSize()` reads to size the tile pyramid. Emit it
      //    any wider and the 319 works whose full-size rung sits in
      //    (4096, 6144] get a grid libvips never wrote — blank tiles, no
      //    error. See deep-zoom-config.mjs's TILE_MIN_WIDTH.
      //  - It guarantees the file genuinely holds 6144 px rather than an
      //    upscale, so the LOD rung is worth fetching.
      //  - fullW > 6144 is equivalent to 6144 * h / w < FULL_SIZE_MAX, so
      //    the encode can never breach libheif's dimension limit — a gate
      //    on raw source width would let a 6800x22000 scroll plan a
      //    6144x19800 AVIF and fail the whole job.
      //
      // `fromSource` (not `isFullSize`) because it needs its own decode:
      // the shared intermediate below is capped at LADDER_MAX_WIDTH, so
      // taking this rung from it would ship a 1.5x upscale of the 4096
      // image — plausible-looking in review and worthless as an LOD.
      if (fullW > GALLERY_LOD_WIDTH) {
        files.push({
          width: GALLERY_LOD_WIDTH,
          format: FORMATS[0], // AVIF
          path: path.join(destDir, `${GALLERY_LOD_WIDTH}.avif`),
          fromSource: true,
        });
      }
    }
  }
  return { destDir, files };
}

async function areAllVariantsFresh(srcStat, files) {
  for (const v of files) {
    try {
      const s = await stat(v.path);
      if (s.mtimeMs < srcStat.mtimeMs) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function collectJobs() {
  const jobs = [];
  for (const folder of FOLDERS) {
    const srcDir = path.join(SRC_ROOT, folder);
    const names = await readdir(srcDir).catch(() => []);
    for (const name of names) {
      if (!IMAGE_EXTS.has(path.extname(name).toLowerCase())) continue;
      const srcPath = path.join(srcDir, name);
      const srcStat = await stat(srcPath);
      // Probe source dimensions so variantPaths can plan the per-source
      // full-size AVIF when applicable. Sharp reads only the file
      // header here, so it's fast even on the 700 MB Wikimedia scans.
      let sourceWidth = 0;
      let sourceHeight = 0;
      try {
        const meta = await sharp(srcPath, {
          unlimited: true,
          limitInputPixels: false,
        }).metadata();
        sourceWidth = meta.width ?? 0;
        sourceHeight = meta.height ?? 0;
      } catch {
        // Probe failure → just emit the standard variants; processFile
        // will fail loudly if the source is truly unreadable.
      }
      const { destDir, files } = variantPaths(folder, name, sourceWidth, sourceHeight);
      jobs.push({
        folder,
        name,
        srcPath,
        srcStat,
        sourceWidth,
        sourceHeight,
        destDir,
        variants: files,
      });
    }
  }
  // Smallest first: fast early progress + big files spread across workers
  // rather than clustering at the end and spiking memory.
  jobs.sort((a, b) => a.srcStat.size - b.srcStat.size);
  return jobs;
}

async function processFile(job) {
  // 1. Decode once into a bounded intermediate raw-pixel buffer.
  //    limitInputPixels:false lifts the 268M-pixel cap for the biggest
  //    Google Arts scans (10000+ px). unlimited:true skips a couple of
  //    safety checks that reject oversized metadata.
  const { data: base, info } = await sharp(job.srcPath, {
    failOn: "none",
    unlimited: true,
    limitInputPixels: false,
  })
    .rotate() // apply EXIF rotation then discard the tag
    .flatten({ background: "#ffffff" }) // PNG/webp alpha → flat white
    .resize({
      width: LADDER_MAX_WIDTH,
      height: FULL_SIZE_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. From that intermediate, emit each variant. Each is cheap because
  //    the expensive JPEG decode + EXIF rotate + alpha flatten is done.
  //    The two above-ladder rungs are the exception: both re-decode the
  //    source, because the bounded intermediate above is capped at
  //    LADDER_MAX_WIDTH and has already thrown away the pixels they
  //    need. Encoding either one from `base` would silently upscale.
  let bytesAfter = 0;
  for (const v of job.variants) {
    if (v.isFullSize || v.fromSource) {
      await sharp(job.srcPath, {
        failOn: "none",
        unlimited: true,
        limitInputPixels: false,
      })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width: v.isFullSize ? FULL_SIZE_MAX : v.width,
          height: FULL_SIZE_MAX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .avif({ quality: 60, effort: 2 })
        .toFile(v.path);
    } else {
      const targetW = Math.min(v.width, info.width);
      const pipeline = sharp(base, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels,
        },
      }).resize({ width: targetW, withoutEnlargement: true });
      await v.format.encode(pipeline).toFile(v.path);
    }
    bytesAfter += (await stat(v.path)).size;
  }

  return { before: job.srcStat.size, after: bytesAfter, variants: job.variants.length };
}

async function runPool(jobs, onProgress) {
  const queue = jobs.slice();
  const totals = {
    done: 0,
    built: 0,
    fresh: 0,
    errors: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    variantsWritten: 0,
  };

  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      totals.done++;

      if (!FORCE && (await areAllVariantsFresh(job.srcStat, job.variants))) {
        totals.fresh++;
        onProgress(totals, job, null);
        continue;
      }

      if (DRY_RUN) {
        totals.built++;
        totals.bytesBefore += job.srcStat.size;
        onProgress(totals, job, { dryRun: true });
        continue;
      }

      try {
        await mkdir(job.destDir, { recursive: true });
        const r = await processFile(job);
        totals.built++;
        totals.bytesBefore += r.before;
        totals.bytesAfter += r.after;
        totals.variantsWritten += r.variants;
        onProgress(totals, job, r);
      } catch (e) {
        totals.errors++;
        onProgress(totals, job, { error: e });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return totals;
}

async function main() {
  const start = Date.now();
  console.log(
    `[shrink] mode=${DRY_RUN ? "DRY RUN" : "build"} widths=${WIDTHS.join(",")} formats=${FORMATS.map((f) => f.ext).join(",")} concurrency=${CONCURRENCY}${FORCE ? " force=true" : ""}`,
  );
  console.log(
    `[shrink] src=${path.relative(ROOT, SRC_ROOT)}/  dest=${path.relative(ROOT, DEST_ROOT)}/`,
  );
  console.log(`[shrink] folders=${FOLDERS.join(", ")}`);

  process.stdout.write(`[shrink] scanning sources…`);
  const jobs = await collectJobs();
  const totalBytes = jobs.reduce((a, j) => a + j.srcStat.size, 0);
  const totalVariants = jobs.reduce((a, j) => a + j.variants.length, 0);
  const fullSizeJobs = jobs.filter((j) => j.variants.some((v) => v.isFullSize)).length;
  const lodRungJobs = jobs.filter((j) => j.variants.some((v) => v.fromSource)).length;
  console.log(`\r[shrink] scanning sources… ${jobs.length} files, ${fmt(totalBytes)} total`);
  console.log(
    `[shrink] will produce ${totalVariants} variant files (${fullSizeJobs} full-size AVIFs for >${FULL_SIZE_MIN_WIDTH}px sources, ${lodRungJobs} ${GALLERY_LOD_WIDTH}px gallery LOD rungs) if nothing is fresh`,
  );

  const totals = await runPool(jobs, (t, job, result) => {
    const hasError = !!result?.error;
    if (!hasError && t.done % 10 !== 0 && t.done !== jobs.length) return;
    // Base ETA on actual build work, not inspection count. Fresh-skipped
    // jobs take ~1ms (just a stat call) while built jobs take ~1s, so
    // dividing by t.done flattens the rate and gives wildly optimistic
    // ETAs on resumed runs where most files are already fresh.
    const remainingBuild = jobs.length - t.fresh - t.built - t.errors;
    const eta = t.built ? ((Date.now() - start) / t.built) * remainingBuild : 0;
    const errTag = hasError ? ` ! ${job.name}: ${result.error.message}` : "";
    const outMb = (t.bytesAfter / 1e6).toFixed(0);
    console.log(
      `  [${t.done}/${jobs.length}] built=${t.built} fresh=${t.fresh} err=${t.errors} wrote=${t.variantsWritten} out=${outMb}MB eta=${fmtDuration(eta)}${errTag}`,
    );
  });

  const elapsed = fmtDuration(Date.now() - start);
  console.log(
    `\n[shrink] built: ${totals.built}, fresh(skipped): ${totals.fresh}, errors: ${totals.errors}`,
  );
  if (!DRY_RUN) {
    const ratio = totals.bytesBefore
      ? ((totals.bytesAfter / totals.bytesBefore) * 100).toFixed(1)
      : "0";
    console.log(
      `[shrink] sources ${fmt(totals.bytesBefore)} → variants ${fmt(totals.bytesAfter)} (${ratio}% of source size, ${totals.variantsWritten} files) in ${elapsed}`,
    );
  } else {
    console.log(`[shrink] (dry run — no files written) in ${elapsed}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
