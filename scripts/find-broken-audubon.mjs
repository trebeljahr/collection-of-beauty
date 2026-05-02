#!/usr/bin/env node
/*
 * Detect Audubon "Birds of America" originals where the download truncated
 * mid-file: the JPEG decoder backfills the missing region with a uniform
 * light-gray strip along the right or bottom edge.
 *
 * For each original under assets/audubon-birds/<file>.jpg we:
 *   1. Decode at width=1024 (libvips shrink-on-load — fast on the huge scans).
 *   2. Sample the last 4 columns (right edge) and last 4 rows (bottom edge).
 *   3. Compute mean R/G/B and per-channel variance for each strip.
 *   4. Flag when the strip is near-gray AND uniform — see THRESHOLDS below.
 *
 * The output (metadata/audubon-broken.json) drives scripts/refetch-broken-audubon.sh.
 *
 * Usage:
 *   node scripts/find-broken-audubon.mjs
 *   node scripts/find-broken-audubon.mjs --concurrency=8
 *   node scripts/find-broken-audubon.mjs --quiet
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

sharp.concurrency(1);
sharp.cache(false);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "assets", "audubon-birds");
const META_PATH = path.join(ROOT, "metadata", "audubon-birds.json");
const OUT_PATH = path.join(ROOT, "metadata", "audubon-broken.json");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const QUIET = args.quiet === true;
const CONCURRENCY = Number.parseInt(
  args.concurrency ?? String(Math.min(6, Math.max(2, os.cpus().length - 2))),
  10,
);

// Strip width/height for edge sampling. Decoded at 1024-px-wide so each
// "pixel" of the strip averages ~11 px of original — a thicker effective
// strip than the literal 4-px slice on the source, which is what we want
// (signals get averaged, isolated dust specks don't trip the detector).
const STRIP = 4;

// Spot-checking the smallest/most-clearly-truncated files showed the
// JPEG decoder backfills the missing region with RGB(128,128,128) and
// variance ~0. Other files might land at lighter grays depending on
// the decoder, so the band stays wide and the channel-delta tight.
// "Cast a wide net; user can dismiss false positives."
const THRESHOLDS = {
  meanMin: 100, // mean R/G/B must each be ≥ this
  meanMax: 230, // mean R/G/B must each be ≤ this
  channelDelta: 8, // max(|R-G|, |G-B|, |R-B|) must be < this — i.e., near-gray
  variance: 50, // per-channel variance must be < this — i.e., uniform
};

// ────────────────────────────────────────────────────────────────────────────

function summarise(data, w, h, region) {
  // region: { x0, y0, x1, y1 } half-open. data is RGB raw, 3 bytes/pixel.
  let n = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sqR = 0;
  let sqG = 0;
  let sqB = 0;
  for (let y = region.y0; y < region.y1; y++) {
    const rowBase = y * w * 3;
    for (let x = region.x0; x < region.x1; x++) {
      const i = rowBase + x * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      sqR += r * r;
      sqG += g * g;
      sqB += b * b;
      n++;
    }
  }
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  const varR = sqR / n - meanR * meanR;
  const varG = sqG / n - meanG * meanG;
  const varB = sqB / n - meanB * meanB;
  return {
    mean: [Math.round(meanR), Math.round(meanG), Math.round(meanB)],
    variance: [Math.round(varR), Math.round(varG), Math.round(varB)],
  };
}

function isBroken({ mean, variance }) {
  const [r, g, b] = mean;
  const inRange = (v) => v >= THRESHOLDS.meanMin && v <= THRESHOLDS.meanMax;
  if (!inRange(r) || !inRange(g) || !inRange(b)) return false;
  const delta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  if (delta >= THRESHOLDS.channelDelta) return false;
  if (variance.some((v) => v >= THRESHOLDS.variance)) return false;
  return true;
}

async function analyse(filename) {
  const filePath = path.join(SRC_DIR, filename);
  try {
    const { data, info } = await sharp(filePath, { failOn: "none" })
      .resize({ width: 1024, fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;

    const right = summarise(data, w, h, {
      x0: Math.max(0, w - STRIP),
      y0: 0,
      x1: w,
      y1: h,
    });
    const bottom = summarise(data, w, h, {
      x0: 0,
      y0: Math.max(0, h - STRIP),
      x1: w,
      y1: h,
    });

    const rightBroken = isBroken(right);
    const bottomBroken = isBroken(bottom);

    if (!rightBroken && !bottomBroken) return null;

    return {
      filename,
      edge: rightBroken && bottomBroken ? "both" : rightBroken ? "right" : "bottom",
      right,
      bottom,
      decodedSize: [w, h],
    };
  } catch (err) {
    return {
      filename,
      edge: "decode-error",
      error: String(err?.message ?? err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const files = (await readdir(SRC_DIR))
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort((a, b) => {
      // Numeric prefix order — easier to scan progress.
      const na = Number.parseInt(a.split("_")[0], 10);
      const nb = Number.parseInt(b.split("_")[0], 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });

  if (!QUIET) console.log(`[detect] scanning ${files.length} originals in ${SRC_DIR}`);

  // Lookup id/objectKey from metadata for nicer output entries.
  let metaEntries = {};
  try {
    const meta = JSON.parse(await readFile(META_PATH, "utf8"));
    metaEntries = meta.entries ?? {};
  } catch (err) {
    if (!QUIET)
      console.warn(`[detect] could not load ${META_PATH} (${err.message}); proceeding without it`);
  }

  const broken = [];
  let processed = 0;
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= files.length) return;
      const filename = files[i];
      const result = await analyse(filename);
      processed++;
      if (result) {
        broken.push(result);
        if (!QUIET) {
          const tag = result.edge === "decode-error" ? "decode-error" : `edge=${result.edge}`;
          console.log(`[detect]   ${filename} → ${tag}`);
        }
      }
      if (!QUIET && processed % 50 === 0) {
        console.log(`[detect] ${processed}/${files.length} (${broken.length} flagged so far)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Sort broken list by plate number for stable output.
  broken.sort((a, b) => {
    const na = Number.parseInt(a.filename.split("_")[0], 10);
    const nb = Number.parseInt(b.filename.split("_")[0], 10);
    return (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
  });

  const out = {
    generated_at: new Date().toISOString(),
    source_dir: path.relative(ROOT, SRC_DIR),
    thresholds: THRESHOLDS,
    decoded_strip_width_px: STRIP,
    file_count: files.length,
    broken_count: broken.length,
    broken: broken.map((b) => {
      const entry = metaEntries[b.filename];
      const objectKey = `audubon-birds/${b.filename}`;
      const id = entry ? path.basename(b.filename, path.extname(b.filename)) : null;
      const fileUrl = entry?.source?.file_url ?? null;
      const base = {
        id,
        filename: b.filename,
        objectKey,
        edge: b.edge,
        fileUrl,
      };
      if (b.edge === "decode-error") return { ...base, error: b.error };
      return {
        ...base,
        meanRGB: { right: b.right.mean, bottom: b.bottom.mean },
        variance: { right: b.right.variance, bottom: b.bottom.variance },
        decodedSize: b.decodedSize,
      };
    }),
  };

  await writeFile(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  if (!QUIET) {
    console.log("");
    console.log(`[detect] flagged ${broken.length}/${files.length}`);
    console.log(`[detect] wrote ${path.relative(ROOT, OUT_PATH)}`);
  }
}

await main();
