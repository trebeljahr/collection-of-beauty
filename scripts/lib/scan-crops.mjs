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
  let mtimeMs = 0;
  if (existsSync(file)) {
    mtimeMs = statSync(file).mtimeMs;
    const raw = JSON.parse(readFileSync(file, "utf8"));
    for (const [key, entry] of Object.entries(raw)) {
      if (key.startsWith("_")) continue;
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
  };
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
