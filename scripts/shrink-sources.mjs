#!/usr/bin/env node
/*
 * Build pre-resized AVIF + WebP variants from originals, keeping
 * originals untouched. These variants are served directly by rclone
 * and referenced by <ResponsiveImage>'s <picture>/<source> — Next's
 * image optimizer is out of the hot path entirely.
 *
 *   assets/<bucket>/foo.jpg   (original, untouched)
 *         └──► assets-web/<bucket>/foo/<w>.avif
 *              assets-web/<bucket>/foo/<w>.webp
 *                where <w> ∈ WIDTHS = [256, 480, 640, 960, 1280, 1920, 2560]
 *
 * So each source produces 14 variant files. For the full catalog (~3000
 * artworks) that's ~42k files totalling ~3–6 GB. Each file is tiny
 * (10–600 KB) so serving is fast and CDN-friendly.
 *
 * WIDTHS is duplicated (as VARIANT_WIDTHS) in src/lib/utils.ts — keep
 * the two in sync; they're the contract between the builder and the
 * runtime <picture> renderer.
 *
 * Idempotent: a source is skipped when every one of its 14 variant files
 * exists and has an mtime ≥ the source's. Drop a new original into
 * assets/ and re-run; only that file is processed.
 *
 * Performance: for each source we decode once into a bounded intermediate
 * pixel buffer (≤ 2560 px on the long side), then re-resize/re-encode
 * from that buffer for each of the 14 variants. This avoids 14 separate
 * decodes of the same (possibly huge) JPEG.
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

import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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
const CONCURRENCY = parseInt(
  args.concurrency ?? String(Math.min(6, Math.max(2, os.cpus().length - 2))),
  10,
);
const FOLDERS = args.folder
  ? [args.folder]
  : ["collection-of-beauty", "audubon-birds", "kunstformen-images"];

// ─── Variant schema ────────────────────────────────────────────────────────
// Keep in sync with VARIANT_WIDTHS in src/lib/utils.ts.
const WIDTHS = [256, 480, 640, 960, 1280, 1920, 2560];
const MAX_WIDTH = Math.max(...WIDTHS);
// AVIF q=60 looks indistinguishable from q=85 JPEG but is ~3× smaller.
// WebP q=75 is the usual balance for photographs.
const FORMATS = [
  { ext: "avif", encode: (s) => s.avif({ quality: 60, effort: 4 }) },
  { ext: "webp", encode: (s) => s.webp({ quality: 75, effort: 4 }) },
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
function variantPaths(folder, name) {
  const basename = path.basename(name, path.extname(name));
  const destDir = path.join(DEST_ROOT, folder, basename);
  const files = [];
  for (const w of WIDTHS) {
    for (const f of FORMATS) {
      files.push({
        width: w,
        format: f,
        path: path.join(destDir, `${w}.${f.ext}`),
      });
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
      const { destDir, files } = variantPaths(folder, name);
      jobs.push({ folder, name, srcPath, srcStat, destDir, variants: files });
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
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. From that intermediate, emit each variant. Each is cheap because
  //    the expensive JPEG decode + EXIF rotate + alpha flatten is done.
  let bytesAfter = 0;
  for (const v of job.variants) {
    const targetW = Math.min(v.width, info.width);
    const pipeline = sharp(base, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    }).resize({ width: targetW, withoutEnlargement: true });
    await v.format.encode(pipeline).toFile(v.path);
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
  console.log(
    `\r[shrink] scanning sources… ${jobs.length} files, ${fmt(totalBytes)} total`,
  );
  console.log(
    `[shrink] will produce ${jobs.length * WIDTHS.length * FORMATS.length} variant files (if nothing is fresh)`,
  );

  const totals = await runPool(jobs, (t, job, result) => {
    const hasError = !!result?.error;
    if (!hasError && t.done % 10 !== 0 && t.done !== jobs.length) return;
    const eta = t.done
      ? ((Date.now() - start) / t.done) * (jobs.length - t.done)
      : 0;
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
