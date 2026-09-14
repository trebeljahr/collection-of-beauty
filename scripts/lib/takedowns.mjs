// Works that must never be published, in one place.
//
// metadata/takedowns.json lists source files, keyed "<folder>/<filename>",
// that are still in copyright where the site is operated. Every script that
// could put such a file back in front of the public checks this list:
//
//   - build-data.mjs      never catalogues it
//   - shrink-sources.mjs  never encodes variants for it
//   - fetch-wikimedia-metadata.mjs  never writes a sidecar entry for it
//   - sync-assets.sh      refuses to run while a variant dir for it exists
//
// Checking in all of them is deliberate. A catalogue-only filter is not
// enough: shrink encodes every file under assets/<folder> whether or not it
// is catalogued, and sync mirrors whatever shrink produced, which is how
// uncatalogued in-copyright images ended up publicly served from the bucket.
//
// The originals themselves are moved to assets/.rejected/copyright/, which
// sits outside SOURCE_FOLDERS and outside assets-web/, so nothing reads or
// syncs it. This list is the second line of defence for when a file is
// re-downloaded into a source folder.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TAKEDOWNS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "metadata",
  "takedowns.json",
);

const nfc = (s) => String(s).normalize("NFC");
// Only a real image extension is stripped: basenames themselves contain dots
// ("…_oil_on_canvas,_92.1_x_73_cm,_Tate_Modern…"), so "everything after the
// last dot" would cut a basename in half.
const stripExt = (name) => name.replace(/\.(jpe?g|png|tiff?|webp|gif|bmp|avif|svg)$/i, "");

// Returns a matcher over the takedown list. Matching is by NFC-normalised
// folder and basename (filename without extension), so a re-downloaded copy
// saved as .jpeg instead of .jpg, or decomposed to NFD by a Docker upload,
// is still caught. A missing file means an empty list, not an error: the
// scripts that use this must keep working in a fresh checkout.
export function loadTakedowns(file = TAKEDOWNS_PATH) {
  const keys = new Set();
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    for (const key of Object.keys(raw)) {
      if (key.startsWith("_")) continue;
      const slash = key.indexOf("/");
      if (slash < 1) continue;
      keys.add(`${nfc(key.slice(0, slash))}/${nfc(stripExt(key.slice(slash + 1)))}`);
    }
  }
  return {
    size: keys.size,
    has(folder, filenameOrBasename) {
      return keys.has(`${nfc(folder)}/${nfc(stripExt(filenameOrBasename))}`);
    },
    // "<folder>/<basename>" for every entry: the variant dir under assets-web/
    // and the key prefix on the bucket.
    prefixes() {
      return [...keys];
    },
  };
}
