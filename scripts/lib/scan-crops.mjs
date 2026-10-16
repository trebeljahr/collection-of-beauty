// Crops applied to a scan before anything is derived from it.
//
// metadata/scan-crops.json lists source files, keyed "<folder>/<filename>",
// whose scan shows more than the work: the picture frame, a miniature's case,
// a mount. Each entry gives how much to cut from each side, in percent of the
// original as it is displayed (after its EXIF rotation):
//
//   { "l": 16.3, "t": 12.7, "r": 16.6, "b": 12.7, "_why": "…" }
//
// The original on disk stays byte-for-byte the Commons file, so its SHA-1
// still matches the page and a refetch still recognises it. What changes is
// everything derived from it, and so every script that reads an original has
// to cut it the same way:
//
//   - shrink-sources.mjs  encodes the variants from the cut image
//   - build-tiles.mjs     tiles the cut image
//   - build-data.mjs      catalogues the cut size as width/height
//
// A variant or a tile pyramid counts as stale when it is older than
// scan-crops.json (cropped works only), so editing an entry re-encodes the
// cropped works on the next shrink and tiles run.
//
// An entry can also list the panels of a polyptych photographed as one
// object, in percent of the cut image, left to right:
//
//   "panels": [{ "x0": 0, "y0": 0, "x1": 21.0, "y1": 100 }, …]
//
// with what the museum hangs them by, from the holding museum's record
// where it has one:
//
//   "panelCm": [[76.5, 185.8], …]   each panel's width and height, bare
//   "frameCm": 11                   the width of each panel's frame
//   "gapCm": 0                      between two frames: 0 where hinged
//
// Nothing is encoded per panel. build-data copies them to the catalogue
// (`Artwork.polyptych`), and the museum hangs each panel in a frame of
// its own at those sizes (src/lib/gallery-layout/polyptych.ts). The
// sides of a cut are optional: a scan whose panels stand on a plain
// ground needs no cut.
//
// An entry can also correct a scan's colour, for a larger photograph Rico
// took on the condition that it look like the scan it replaced:
//
//   "tone": { "matrix": [[0.9, 0.1, 0], [0, 1, 0], [0.05, -0.1, 1.05]],
//             "a": [1.08, 1.02, 0.97], "b": [-6, 2, 9],
//             "saturation": 1.3, "sharpen": 0.8 }
//
// In sRGB levels (0–255): the pixel is first multiplied by the 3 × 3
// matrix (optional, sharp's recomb), then each channel becomes
// a * value + b (a defaults to 1), then saturation is multiplied
// (optional), then an optional unsharp mask of that sigma is applied at
// each output size. sharp runs recomb, linear and modulate in that order
// whatever the call order. The numbers are fitted once against the old
// scan and written here; nothing is fitted at encode time. Like a cut, a
// tone makes the work's variants and tiles stale when the table changes.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCAN_CROPS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "metadata",
  "scan-crops.json",
);

const nfc = (s) => String(s).normalize("NFC");
const SIDES = ["l", "t", "r", "b"];

/** Matcher over the crop table, keyed by NFC folder and filename. A missing
 *  file means no crops. An entry that would cut more than 90% of a side, or
 *  holds something other than four numbers, throws: a typo here would
 *  publish a sliver of a painting. */
export function loadScanCrops(file = SCAN_CROPS_PATH) {
  const crops = new Map();
  const panels = new Map();
  const tones = new Map();
  let mtimeMs = 0;
  if (existsSync(file)) {
    mtimeMs = statSync(file).mtimeMs;
    const raw = JSON.parse(readFileSync(file, "utf8"));
    for (const [key, entry] of Object.entries(raw)) {
      if (key.startsWith("_")) continue;
      if (entry.panels) panels.set(nfc(key), readPolyptych(key, entry));
      if (entry.tone) tones.set(nfc(key), readTone(key, entry.tone));
      if (SIDES.every((s) => entry[s] === undefined)) continue;
      for (const s of SIDES) {
        const v = entry[s];
        if (typeof v !== "number" || !(v >= 0) || v >= 45)
          throw new Error(`scan-crops.json: ${key} has a bad "${s}" (${v})`);
      }
      if (entry.l + entry.r >= 90 || entry.t + entry.b >= 90)
        throw new Error(`scan-crops.json: ${key} cuts away more than 90% of a side`);
      crops.set(nfc(key), { l: entry.l, t: entry.t, r: entry.r, b: entry.b });
    }
  }
  return {
    size: crops.size,
    /** Last change to the table: the freshness floor for cropped works. */
    mtimeMs,
    get(folder, filename) {
      return crops.get(`${nfc(folder)}/${nfc(filename)}`) ?? null;
    },
    /** The colour correction of a scan, or null. */
    tone(folder, filename) {
      return tones.get(`${nfc(folder)}/${nfc(filename)}`) ?? null;
    },
    /** A polyptych's panels (fractions of the cut image, and real
     *  sizes), its frame width and the gap between frames. */
    polyptych(folder, filename) {
      return panels.get(`${nfc(folder)}/${nfc(filename)}`) ?? null;
    },
  };
}

const round4 = (v) => Math.round(v * 100) / 10000;

function readPolyptych(key, entry) {
  const panels = readPanels(key, entry.panels);
  const cm = entry.panelCm;
  if (!Array.isArray(cm) || cm.length !== panels.length)
    throw new Error(`scan-crops.json: ${key} needs a panelCm for each panel`);
  for (const [i, wh] of cm.entries()) {
    if (!(wh?.[0] > 0 && wh?.[1] > 0))
      throw new Error(`scan-crops.json: ${key} panelCm ${i} is not a size`);
    panels[i].wCm = wh[0];
    panels[i].hCm = wh[1];
  }
  if (!(entry.frameCm >= 0) || !(entry.gapCm >= 0))
    throw new Error(`scan-crops.json: ${key} needs frameCm and gapCm`);
  return { panels, frameCm: entry.frameCm, gapCm: entry.gapCm };
}

/** A tone is three gains and three offsets in sRGB levels. Values past
 *  these bounds throw: a typo here would publish a recoloured painting. */
function readTone(key, t) {
  const three = (v, lo, hi) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => typeof x === "number" && x >= lo && x <= hi);
  const matrixOk =
    t.matrix === undefined ||
    (Array.isArray(t.matrix) &&
      t.matrix.length === 3 &&
      t.matrix.every((row) => three(row, -1.5, 2.5)));
  if (!matrixOk || (t.a !== undefined && !three(t.a, 0.5, 2.5)) || !three(t.b, -160, 160))
    throw new Error(`scan-crops.json: ${key} has a bad "tone"`);
  if (
    t.saturation !== undefined &&
    !(typeof t.saturation === "number" && t.saturation >= 0.5 && t.saturation <= 2.5)
  )
    throw new Error(`scan-crops.json: ${key} has a bad "tone.saturation"`);
  if (
    t.sharpen !== undefined &&
    !(typeof t.sharpen === "number" && t.sharpen > 0 && t.sharpen <= 3)
  )
    throw new Error(`scan-crops.json: ${key} has a bad "tone.sharpen"`);
  return {
    ...(t.matrix ? { matrix: t.matrix.map((row) => [...row]) } : {}),
    a: t.a ? [...t.a] : [1, 1, 1],
    b: [...t.b],
    ...(t.saturation ? { saturation: t.saturation } : {}),
    ...(t.sharpen ? { sharpen: t.sharpen } : {}),
  };
}

/** Apply a tone to a sharp pipeline (no-op for null). */
export function applyTone(img, tone) {
  if (!tone) return img;
  let out = tone.matrix ? img.recomb(tone.matrix) : img;
  out = out.linear(tone.a, tone.b);
  if (tone.saturation) out = out.modulate({ saturation: tone.saturation });
  return tone.sharpen ? out.sharpen({ sigma: tone.sharpen }) : out;
}

/** Stable string for a tone, for cache signatures. */
export function toneSignature(tone) {
  return tone
    ? `tone:${tone.matrix ? tone.matrix.flat().join(",") : "-"};${tone.a.join(",")};${tone.b.join(",")};${tone.saturation ?? 1};${tone.sharpen ?? 0}`
    : "";
}

/** Panels in percent, checked and returned as fractions. Two panels may
 *  touch but not overlap, and they run left to right. */
function readPanels(key, list) {
  if (!Array.isArray(list) || list.length < 2)
    throw new Error(`scan-crops.json: ${key} needs two panels or more`);
  const out = list.map((q, i) => {
    const ok =
      [q.x0, q.y0, q.x1, q.y1].every((v) => typeof v === "number" && v >= 0 && v <= 100) &&
      q.x1 > q.x0 &&
      q.y1 > q.y0;
    if (!ok) throw new Error(`scan-crops.json: ${key} panel ${i} is not a rectangle`);
    return { x0: round4(q.x0), y0: round4(q.y0), x1: round4(q.x1), y1: round4(q.y1) };
  });
  for (let i = 1; i < out.length; i++)
    if (out[i].x0 < out[i - 1].x1)
      throw new Error(`scan-crops.json: ${key} panel ${i} overlaps the one before it`);
  return out;
}

/** The pixel rectangle a crop keeps of an image `width` × `height` (the
 *  displayed, EXIF-rotated size), in the shape sharp's extract() takes. */
export function cropRect(crop, width, height) {
  const left = Math.round((crop.l / 100) * width);
  const top = Math.round((crop.t / 100) * height);
  const right = Math.round((crop.r / 100) * width);
  const bottom = Math.round((crop.b / 100) * height);
  return { left, top, width: width - left - right, height: height - top - bottom };
}

/** Displayed size from a sharp/image-size header: orientations 5–8 swap the
 *  axes. */
export function orientedSize(width, height, orientation) {
  return orientation && orientation >= 5 ? { width: height, height: width } : { width, height };
}

/** Stable string for a crop, for cache signatures. */
export function cropSignature(crop) {
  return crop ? `crop:${SIDES.map((s) => crop[s]).join(",")}` : "";
}
