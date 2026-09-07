#!/usr/bin/env node
/*
 * Build Deep Zoom (DZI) tile pyramids for the high-resolution sources, so
 * the lightbox can zoom to brushstroke level without ever decoding a
 * whole gigapixel image.
 *
 *   assets/<folder>/foo.jpg   (original, untouched)
 *         └──► assets-web/<folder>/foo/tiles/<level>/<col>_<row>.webp
 *
 * Why this exists
 * ---------------
 * `pnpm assets:shrink` already emits a per-source full-resolution AVIF
 * for every source whose full-size encode clears FULL_SIZE_MIN_WIDTH in
 * variant-config.mjs — the same threshold deep-zoom-config.mjs imports as
 * TILE_MIN_WIDTH, which is why the job list below and the runtime always
 * agree on who has a pyramid. That file is genuinely full detail, but it
 * is a SINGLE image: across the 968
 * works that have one, the median is ~124 megapixels and the largest is
 * ~265. Decoding one costs ~4 bytes per pixel of RAM (124 MP ≈ 500 MB),
 * and 890 of them exceed the ~16.7 MP decode ceiling that mobile Safari
 * has historically enforced. So the detail was nominally "shipped" and
 * practically unreachable — the modal either OOM-thrashed or silently
 * failed to paint.
 *
 * A tile pyramid fixes that structurally: the viewer only ever fetches
 * and decodes the handful of 512 px tiles covering the current viewport
 * at the current zoom, no matter how big the source is.
 *
 * Cost
 * ----
 * Measured on the median work (Rembrandt, The Mill, 12229x10167): 654
 * tiles totalling 18 MB, against 15.8 MB for the single full-size AVIF.
 * So a pyramid runs ~1.14x the bytes of the file it replaces — roughly
 * +8 GB across the whole catalogue — while cutting peak decode memory by
 * three orders of magnitude. The object count is the real price: ~630k
 * extra files in the bucket. rclone's --fast-list handles it, but expect
 * the remote-index pass in `pnpm assets:sync` to get noticeably slower.
 *
 * Format
 * ------
 * WebP, not AVIF. libvips `dzsave` accepts only jpeg/png/webp, so AVIF
 * tiles aren't possible; WebP is also the better interactive choice since
 * a single pan decodes dozens of tiles and WebP decodes appreciably
 * faster than AVIF at small sizes.
 *
 * Source
 * ------
 * Tiled from the ORIGINAL, not from the full-size AVIF, so the deepest
 * level isn't a lossy re-encode of an already-lossy q60 file. Same decode
 * cost profile as the full-size variant shrink already builds.
 *
 * Idempotent: a work is skipped when its deepest level already holds the
 * expected tile count with an mtime >= the source's. Interrupted runs are
 * safe — each pyramid is built into a temp dir and renamed into place
 * only once complete, so a half-written pyramid never looks fresh.
 *
 * Usage:
 *   node scripts/build-tiles.mjs                    # build
 *   node scripts/build-tiles.mjs --dry-run          # count + estimate
 *   node scripts/build-tiles.mjs --folder=audubon-birds
 *   node scripts/build-tiles.mjs --limit=5          # first N (smoke test)
 *   node scripts/build-tiles.mjs --force            # rebuild everything
 *   node scripts/build-tiles.mjs --concurrency=4
 */

import { readFileSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  deepZoomSize,
  TILE_DIR,
  TILE_FORMAT,
  TILE_OVERLAP,
  TILE_SIZE,
} from "../src/lib/deep-zoom-config.mjs";

// One libvips thread per op; parallelize at the JS level instead — same
// tradeoff scripts/shrink-sources.mjs makes, for the same reason.
sharp.concurrency(1);
sharp.cache(false);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "assets");
const DEST_ROOT = path.join(ROOT, "assets-web");
const CATALOGUE = path.join(ROOT, "src", "data", "artworks.json");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const DRY_RUN = args["dry-run"] === true;
const FORCE = args.force === true;
const LIMIT = args.limit ? Number.parseInt(args.limit, 10) : Infinity;
const FOLDER = typeof args.folder === "string" ? args.folder : null;
const CONCURRENCY = Number.parseInt(
  args.concurrency ?? String(Math.min(6, Math.max(2, os.cpus().length - 2))),
  10,
);

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
  return `${m}m ${s % 60}s`;
}

// DZI numbers levels so that the deepest one holds the image at full
// size and each step up halves it, down to a single 1x1 tile at level 0.
// That makes the deepest level index ceil(log2(longest side)) — the same
// formula OpenSeadragon's DziTileSource uses to pick a starting level, so
// the two agree without the pyramid having to describe itself.
function maxLevelFor(width, height) {
  return Math.ceil(Math.log2(Math.max(width, height)));
}

function tileCountAtDeepestLevel(width, height) {
  return Math.ceil(width / TILE_SIZE) * Math.ceil(height / TILE_SIZE);
}

// Work out which catalogue entries want a pyramid. The predicate lives in
// deep-zoom-config.mjs and is shared with the runtime, so this list is by
// construction the same set the viewer will try to fetch tiles for.
function collectJobs() {
  const artworks = JSON.parse(readFileSync(CATALOGUE, "utf8"));
  const jobs = [];
  for (const art of artworks) {
    const size = deepZoomSize(art.variantWidths, art.width, art.height);
    if (!size) continue;
    if (FOLDER && art.folder !== FOLDER) continue;
    const filename = art.objectKey.slice(art.objectKey.lastIndexOf("/") + 1);
    const basename = filename.replace(/\.[^.]+$/, "");
    jobs.push({
      id: art.id,
      srcPath: path.join(SRC_ROOT, art.objectKey),
      destDir: path.join(DEST_ROOT, art.folder, basename, TILE_DIR),
      width: size.width,
      height: size.height,
    });
  }
  return jobs;
}

// Fresh when the deepest level already holds every tile it should and was
// written no earlier than the source. Checking only the deepest level is
// deliberate: it is where ~80% of the tiles live, and the tiler writes it
// last, so a complete deepest level implies the shallower ones landed too.
async function isFresh(job, srcStat) {
  const deepest = path.join(job.destDir, String(maxLevelFor(job.width, job.height)));
  try {
    const dirStat = await stat(deepest);
    if (dirStat.mtimeMs < srcStat.mtimeMs) return false;
    const files = await readdir(deepest);
    return files.length >= tileCountAtDeepestLevel(job.width, job.height);
  } catch {
    return false;
  }
}

async function dirSize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

async function buildPyramid(job) {
  const parent = path.dirname(job.destDir);
  await mkdir(parent, { recursive: true });
  // Build into a temp sibling and rename once complete, so an interrupted
  // run can never leave a partial pyramid that the freshness check would
  // later mistake for a finished one.
  const tmpBase = path.join(parent, `.tiles-tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await sharp(job.srcPath, { failOn: "none", unlimited: true, limitInputPixels: false })
      .rotate() // bake EXIF orientation, matching the variant ladder
      .flatten({ background: "#ffffff" }) // PNG/WebP alpha -> flat white
      // Resize to exactly the dimensions deepZoomSize() computes rather
      // than letting `fit: "inside"` round on its own. The runtime derives
      // the same pair from catalogue data to size the viewport; if the two
      // disagreed by a pixel the tile grid could gain or lose a row and
      // the viewer would request tiles that were never written.
      .resize(job.width, job.height, { fit: "fill" })
      .webp({ quality: 72, effort: 3 })
      .tile({ size: TILE_SIZE, overlap: TILE_OVERLAP, layout: "dz" })
      .toFile(`${tmpBase}.dz`);

    // dzsave writes "<base>_files/" plus a "<base>.dzi" manifest and a
    // vips-properties.xml. We describe the pyramid inline in the client
    // from catalogue data, so both descriptors are dead weight in the
    // bucket — drop them rather than mirroring 2k unused files to R2.
    await rm(path.join(`${tmpBase}_files`, "vips-properties.xml"), { force: true });
    await rm(`${tmpBase}.dzi`, { force: true });
    await rm(job.destDir, { recursive: true, force: true });
    await rename(`${tmpBase}_files`, job.destDir);

    return { bytes: await dirSize(job.destDir) };
  } catch (e) {
    await rm(`${tmpBase}_files`, { recursive: true, force: true });
    await rm(`${tmpBase}.dzi`, { force: true });
    throw e;
  }
}

async function runPool(jobs, onProgress) {
  const queue = jobs.slice();
  const totals = { done: 0, built: 0, fresh: 0, errors: 0, bytes: 0 };

  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      totals.done++;

      let srcStat;
      try {
        srcStat = await stat(job.srcPath);
      } catch {
        totals.errors++;
        onProgress(totals, job, { error: new Error("source missing") });
        continue;
      }

      if (!FORCE && (await isFresh(job, srcStat))) {
        totals.fresh++;
        onProgress(totals, job, null);
        continue;
      }

      if (DRY_RUN) {
        totals.built++;
        onProgress(totals, job, { dryRun: true });
        continue;
      }

      try {
        const r = await buildPyramid(job);
        totals.built++;
        totals.bytes += r.bytes;
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
  let jobs = collectJobs();
  if (Number.isFinite(LIMIT)) jobs = jobs.slice(0, LIMIT);

  const estTiles = jobs.reduce(
    (a, j) => a + Math.round(tileCountAtDeepestLevel(j.width, j.height) * 1.34),
    0,
  );
  console.log(
    `[tiles] mode=${DRY_RUN ? "DRY RUN" : "build"} tile=${TILE_SIZE}px overlap=${TILE_OVERLAP} format=${TILE_FORMAT} concurrency=${CONCURRENCY}${FORCE ? " force=true" : ""}`,
  );
  console.log(`[tiles] src=assets/  dest=assets-web/<folder>/<basename>/${TILE_DIR}/`);
  // 1.34x: the deepest level holds 3/4 of a DZI pyramid's tiles, since
  // each level up is a quarter the size (1 + 1/4 + 1/16 + ... -> 4/3).
  console.log(`[tiles] ${jobs.length} works to pyramid, ~${estTiles} tiles if nothing is fresh`);

  const totals = await runPool(jobs, (t, job, result) => {
    const hasError = !!result?.error;
    if (!hasError && t.done % 5 !== 0 && t.done !== jobs.length) return;
    const remaining = jobs.length - t.fresh - t.built - t.errors;
    const eta = t.built ? ((Date.now() - start) / t.built) * remaining : 0;
    const errTag = hasError ? ` ! ${job.id}: ${result.error.message}` : "";
    console.log(
      `  [${t.done}/${jobs.length}] built=${t.built} fresh=${t.fresh} err=${t.errors} out=${fmt(t.bytes)} eta=${fmtDuration(eta)}${errTag}`,
    );
  });

  console.log(
    `\n[tiles] built: ${totals.built}, fresh(skipped): ${totals.fresh}, errors: ${totals.errors}`,
  );
  if (!DRY_RUN) {
    console.log(`[tiles] wrote ${fmt(totals.bytes)} of tiles in ${fmtDuration(Date.now() - start)}`);
  }
  if (totals.errors > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
