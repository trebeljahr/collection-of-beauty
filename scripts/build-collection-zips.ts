#!/usr/bin/env -S npx tsx
/**
 * Build the four plate-set ZIPs for publishing to the asset bucket.
 *
 *   pnpm collections:zips [--out .collection-zips] [--only <slug>] [--from-cdn]
 *
 * Reads each plate's 2,560 px AVIF from ../assets-web (the shared asset
 * directory of the main checkout), or with --from-cdn from the public
 * asset host, writes `<out>/<slug>-2560px.zip`, and records its sha256,
 * size and entry count in src/data/collection-zips.json with
 * `published: false`. Publishing is a separate, authorised step
 * (scripts/publish-collection-zips.sh), then
 * `node scripts/collection-zips.mjs --verify --mark-published`.
 *
 * A rebuild with the same plates writes the same bytes: the ZIP stream
 * stamps no time, so an unchanged set keeps its URL.
 */
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { collectionZip } from "../src/lib/collection-zip";
import { PLATE_SETS } from "../src/lib/plate-sets";
import { publicVariantUrl } from "../src/lib/utils";
import { COLLECTION_ZIPS_METADATA, readCollectionZips } from "./collection-zips.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** assets-web is one directory for every worktree; find it beside the repo
 *  or in the main checkout a worktree hangs under. */
function assetsWebDir(): string {
  for (const candidate of [join(root, "assets-web"), resolve(root, "../../../assets-web")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("assets-web not found; pass --from-cdn to read plates from the asset host.");
}

function variantFile(base: string, objectKey: string, width: number): string {
  const slash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, slash);
  const stem = objectKey.slice(slash + 1).replace(/\.[^.]+$/, "");
  return join(base, dir, stem, `${width}.avif`);
}

async function main() {
  const out = resolve(root, arg("--out") ?? ".collection-zips");
  const only = arg("--only");
  const fromCdn = process.argv.includes("--from-cdn");
  const base = fromCdn ? null : assetsWebDir();
  mkdirSync(out, { recursive: true });
  const meta = readCollectionZips();

  for (const set of PLATE_SETS) {
    if (only && set.id !== only) continue;
    const zip = collectionZip(set.id, async (objectKey, width) => {
      if (base) {
        const file = variantFile(base, objectKey, width);
        if (!existsSync(file)) throw new Error(`Missing plate ${file}`);
        return createReadStream(file);
      }
      const res = await fetch(publicVariantUrl(objectKey, width, "avif"));
      if (!res.ok || !res.body) throw new Error(`Upstream ${res.status} for ${objectKey}`);
      return Readable.fromWeb(res.body as never);
    });
    if (!zip) {
      console.warn(`[zips] ${set.id}: no plates built, skipped`);
      continue;
    }
    const target = join(out, zip.filename);
    const hash = createHash("sha256");
    await pipeline(
      Readable.fromWeb(zip.stream as never),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          yield chunk;
        }
      },
      createWriteStream(target),
    );
    const sha256 = hash.digest("hex");
    const bytes = statSync(target).size;
    const previous = meta.sets[set.id];
    const unchanged = previous?.sha256 === sha256;
    meta.sets[set.id] = {
      sha256,
      bytes,
      entries: zip.entryCount,
      filename: zip.filename,
      path: `/downloads/v1/${sha256}/${zip.filename}`,
      // An unchanged archive keeps its published object.
      published: unchanged ? previous.published : false,
    };
    console.log(
      `[zips] ${set.id}: ${zip.entryCount} entries, ${(bytes / 1e6).toFixed(1)} MB, ${sha256.slice(0, 12)}${unchanged ? " (unchanged)" : ""}`,
    );
  }

  writeFileSync(COLLECTION_ZIPS_METADATA, `${JSON.stringify(meta, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
