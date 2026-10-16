/**
 * Versions the variant URLs of works whose pixels changed in place.
 *
 * Variants and tiles are served `Cache-Control: immutable` for a year
 * (scripts/sync-assets.sh), and their URL is derived from the original's
 * filename alone. Two things re-encode a work under the same filename:
 *   - a cut in metadata/scan-crops.json, which takes the frame off a scan;
 *   - a larger original from Commons, recorded in
 *     metadata/refetched-originals.json.
 * After either, every browser and the CDN edge that saw the old file keep
 * it: on 17 October 2026 Krüger's Parade still hung with its frame
 * although the variants on disk were cut. So such a work's URLs carry
 * `?v=<hash>` of what changed its pixels (src/lib/utils.ts), and a new cut
 * or a new download gives it a new version. Works never re-encoded get no
 * entry and keep their URLs.
 *
 * Anything else that re-encodes a work under its old filename has to add
 * its record here, or its visitors keep the old pixels.
 *
 * Writes src/data/asset-versions.json: { [objectKey]: version }, for
 * catalogued works only. It ships in the client bundle, so it stays small.
 * Run: `pnpm assets:versions` (also run by `pnpm assets:build-data`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cropSignature, loadScanCrops } from "./lib/scan-crops.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFETCHED = path.join(ROOT, "metadata", "refetched-originals.json");
const ARTWORKS = path.join(ROOT, "src", "data", "artworks.json");
const OUT = path.join(ROOT, "src", "data", "asset-versions.json");

const nfc = (s) => String(s).normalize("NFC");

const crops = loadScanCrops();
const refetched = new Map(
  existsSync(REFETCHED)
    ? Object.entries(JSON.parse(readFileSync(REFETCHED, "utf8"))).map(([k, v]) => [nfc(k), v])
    : [],
);

const versions = {};
for (const { objectKey } of JSON.parse(readFileSync(ARTWORKS, "utf8"))) {
  const slash = objectKey.lastIndexOf("/");
  const crop = cropSignature(crops.get(objectKey.slice(0, slash), objectKey.slice(slash + 1)));
  const refetch = refetched.get(nfc(objectKey));
  if (!crop && !refetch) continue;
  const what = `${refetch ? `sha1:${refetch.sha1}` : ""}${crop}`;
  versions[objectKey] = createHash("sha1").update(what).digest("hex").slice(0, 8);
}

const sorted = Object.fromEntries(Object.entries(versions).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`[asset-versions] ${Object.keys(sorted).length} works with versioned variant URLs`);
