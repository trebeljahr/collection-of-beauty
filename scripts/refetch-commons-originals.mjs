#!/usr/bin/env node
/**
 * Re-download a work's own Commons file at its original size.
 *
 * Most of assets/collection-of-beauty was saved by hand from a browser.
 * A right-click on a Wikipedia page saves the preview, not the file:
 * the download URL is `…/commons/thumb/…/960px-<name>`, and what lands
 * on disk is 960, 1280 or 2560 px wide whatever the original holds. A
 * few other works were saved whole and re-uploaded larger since.
 *
 * This script fixes those, one work at a time, and nothing else. It
 * fetches the file on the page the work's `commonsUrl` already names,
 * so it adds no source and no licence. The filename on disk and the
 * artwork id stay as they are.
 *
 * A work is skipped, with the reason, when:
 *   - the Commons page is not the file on disk. Some sidecar entries
 *     name a different upload of the same painting; that is a new
 *     source and a person decides it. The two are matched by name, so
 *     a file that was renamed by hand is skipped as well.
 *     `--accept-renamed=<id>,<id>` takes such a file, after someone
 *     has matched it to the page another way: its SHA-1 is a revision
 *     of the page, or macOS kept the page's preview address on it
 *     (`xattr -p com.apple.metadata:kMDItemWhereFroms`);
 *   - the file is on the takedown list, or the artist's German term
 *     (70 years after the death year, §64 UrhG) has not ended. No
 *     exception is made for the open rule-of-the-shorter-term cases;
 *   - the page's licence is not the one the catalogue records, or the
 *     page carries a deletion or missing-licence tag;
 *   - Commons has no more pixels than the disk;
 *   - the larger file is a different picture: another crop or other
 *     colours. `--accept-changed=<id>,<id>` replaces those anyway,
 *     after someone has looked at both.
 *
 * The download is checked against the size and SHA-1 the API reports
 * for the page's current revision. The copy it replaces is moved to
 * assets/.rejected/replaced-smaller/, which nothing reads or syncs.
 * Every replacement is recorded in metadata/refetched-originals.json.
 *
 * Usage:
 *   node scripts/refetch-commons-originals.mjs --ids=<file> [--dry-run]
 *   node scripts/refetch-commons-originals.mjs --id=<artwork id>
 *
 * `--ids` names a text file with one artwork id per line. Afterwards:
 *   pnpm assets:shrink --folder=<folder> && pnpm assets:tiles &&
 *   pnpm assets:build-data && pnpm assets:verify
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { emValue } from "./lib/commons-extmetadata.mjs";
import { licenceClass, publicDomainInGermanyFrom, sameFile } from "./lib/commons-refetch.mjs";
import { loadTakedowns } from "./lib/takedowns.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const REPLACED = path.join(ASSETS, ".rejected", "replaced-smaller");
const LOG_PATH = path.join(ROOT, "metadata", "refetched-originals.json");
const API = "https://commons.wikimedia.org/w/api.php";
const UA =
  "CollectionOfBeautyBot/1.0 (https://collectionofbeauty.com; personal public-domain art catalogue)";
const REQUEST_GAP_MS = 500;

/** Without a death year, a work this old is past any term: made at 15
 *  by someone who lived to 115 still clears it. */
const AGE_WITHOUT_DEATH_YEAR = 170;
/** The larger file must have the smaller one's proportions. A preview
 *  is rounded to whole pixels: the previews drifted 0.03% at most, the
 *  two other photographs 1.2% and 1.8%. */
const ASPECT_TOLERANCE = 0.005;
/** Mean difference per channel, of 255, between both files at 32 × 32.
 *  Measured on the first run: 23 previews against their originals came
 *  to between 0.6 and 2.9. Two Mucha canvases that had been uploaded
 *  again as another photograph came to 36 and 43. */
const MAX_MEAN_DIFFERENCE = 5;

/** Tags that mean the page's status is in question. */
const PROBLEM_TEMPLATES = [
  "Template:Delete",
  "Template:Copyvio",
  "Template:Speedydelete",
  "Template:No license since",
  "Template:No permission since",
  "Template:No source since",
  "Template:Wrong license",
];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const DRY_RUN = args["dry-run"] === true;
const ACCEPT_CHANGED = new Set(
  typeof args["accept-changed"] === "string" ? args["accept-changed"].split(",") : [],
);
const ACCEPT_RENAMED = new Set(
  typeof args["accept-renamed"] === "string" ? args["accept-renamed"].split(",") : [],
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
async function polite() {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

async function api(params) {
  const body = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params });
  for (let attempt = 0; attempt < 5; attempt++) {
    await polite();
    const res = await fetch(API, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.status === 429 || res.status === 503) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Commons API: HTTP ${res.status}`);
    const json = await res.json();
    if (json.error?.code === "maxlag") {
      await sleep(5000);
      continue;
    }
    if (json.error) throw new Error(`Commons API: ${json.error.code}`);
    return json;
  }
  throw new Error("Commons API: gave up after 5 tries");
}

async function sha1Of(file) {
  const hash = createHash("sha1");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Both files at 32 × 32, stretched to the same square: the mean
 *  difference per channel. Stretching is fine, the proportions are
 *  checked on their own. */
async function meanDifference(a, b) {
  const tiny = (file) =>
    sharp(file, { failOn: "none", unlimited: true, limitInputPixels: false })
      .resize(32, 32, { fit: "fill" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer();
  const [x, y] = await Promise.all([tiny(a), tiny(b)]);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}

async function download(url, dest) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await polite();
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status === 503) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`download: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    return;
  }
  throw new Error("download: gave up after 4 tries");
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch (err) {
    if (fallback !== undefined && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function refetch(work, ctx) {
  const { takedowns, artistsBySlug, staging, log, year } = ctx;
  const skip = (reason) => ({ id: work.id, action: "skipped", reason });
  const slash = work.objectKey.indexOf("/");
  const folder = work.objectKey.slice(0, slash);
  const filename = work.objectKey.slice(slash + 1);
  const target = path.join(ASSETS, work.objectKey);

  if (!work.commonsUrl?.startsWith("https://commons.wikimedia.org/wiki/")) {
    return skip("no Commons page in the catalogue");
  }
  const title = decodeURIComponent(new URL(work.commonsUrl).pathname.slice("/wiki/".length));
  // A name given by hand says nothing about the page. The picture
  // check below still stops such a file when it is not the page's.
  const renamed = ACCEPT_RENAMED.has(work.id) && !sameFile(filename, title);
  if (!renamed && !sameFile(filename, title)) {
    return skip(`the catalogue names another Commons file: ${title}`);
  }
  if (takedowns.has(folder, filename)) return skip("on the takedown list");

  const artist = artistsBySlug.get(work.artistSlug);
  if (artist?.died != null) {
    const from = publicDomainInGermanyFrom(artist.died);
    if (year < from) {
      return skip(
        `${artist.name} died in ${artist.died}: the German term runs to the end of ${from - 1}`,
      );
    }
  } else if (work.year == null || year - work.year < AGE_WITHOUT_DEATH_YEAR) {
    return skip("no death year for the artist and the work is not old enough to do without");
  }

  if (!(await exists(target))) return skip("no file on disk");
  const before = await sharp(target, { limitInputPixels: false }).metadata();

  const json = await api({
    action: "query",
    titles: title,
    prop: "imageinfo|templates",
    iiprop: "timestamp|size|sha1|url|mime|extmetadata",
    tlnamespace: "10",
    tllimit: "max",
    tltemplates: PROBLEM_TEMPLATES.join("|"),
  });
  const page = json.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info) return skip("the page is gone from Commons");
  if (!sameFile(renamed ? title : filename, page.title)) {
    return skip(`the page is now ${page.title}`);
  }

  const flagged = (page.templates ?? []).map((t) => t.title);
  if (flagged.length) return skip(`the page is tagged ${flagged.join(", ")}`);

  const licence = emValue(info.extmetadata, "LicenseShortName");
  const copyrighted = emValue(info.extmetadata, "Copyrighted");
  if (licenceClass(licence) !== licenceClass(work.license)) {
    return skip(`licence on Commons is "${licence}", the catalogue records "${work.license}"`);
  }
  if (licenceClass(licence) === "public-domain" && copyrighted !== "False") {
    return skip(`tagged "${licence}" but marked copyrighted`);
  }

  const url = new URL(info.url);
  if (
    url.hostname !== "upload.wikimedia.org" ||
    !url.pathname.startsWith("/wikipedia/commons/") ||
    url.pathname.includes("/thumb/")
  ) {
    return skip(`unexpected file address: ${info.url}`);
  }
  if (info.width <= before.width) {
    return skip(`Commons holds ${info.width} px, the disk ${before.width} px`);
  }

  const result = {
    id: work.id,
    objectKey: work.objectKey,
    commonsTitle: page.title,
    licence,
    revision: info.timestamp,
    sha1: info.sha1,
    bytes: info.size,
    width: info.width,
    height: info.height,
    previous: { width: before.width, height: before.height },
  };
  if (DRY_RUN) return { ...result, action: "would fetch" };

  const staged = path.join(staging, `${createHash("sha1").update(work.id).digest("hex")}.part`);
  await download(info.url, staged);
  const stat = await fs.stat(staged);
  const sha1 = await sha1Of(staged);
  if (stat.size !== info.size || sha1 !== info.sha1) {
    return skip(`download does not match the page's file (${stat.size} bytes, sha1 ${sha1})`);
  }

  const aspectDrift = Math.abs(Math.log(info.width / info.height / (before.width / before.height)));
  const difference = await meanDifference(target, staged);
  result.aspectDrift = Number(aspectDrift.toFixed(4));
  result.meanDifference = Number(difference.toFixed(2));
  const changed = aspectDrift > ASPECT_TOLERANCE || difference > MAX_MEAN_DIFFERENCE;
  if (changed && !ACCEPT_CHANGED.has(work.id)) {
    return {
      ...result,
      action: "skipped",
      reason: `the larger file is a different picture (proportions off by ${(aspectDrift * 100).toFixed(1)}%, mean difference ${difference.toFixed(1)} of 255)`,
      staged,
    };
  }

  const backup = path.join(REPLACED, folder, filename);
  if (await exists(backup)) return skip(`a replaced copy is already kept at ${backup}`);
  const previousStat = await fs.stat(target);
  result.previous.bytes = previousStat.size;
  result.previous.sha1 = await sha1Of(target);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.rename(target, backup);
  // A copy, not a rename: the staging directory can be on another volume.
  // It also gives the file a fresh mtime, which is what tells shrink to
  // re-encode the variants.
  await fs.copyFile(staged, target);
  await fs.unlink(staged);

  log[work.objectKey] = {
    id: work.id,
    fetchedAt: new Date().toISOString(),
    commonsTitle: page.title,
    licence,
    revision: info.timestamp,
    sha1: info.sha1,
    bytes: info.size,
    width: info.width,
    height: info.height,
    previous: result.previous,
    ...(changed ? { acceptedChange: true } : {}),
    ...(renamed ? { renamedByHand: true } : {}),
  };
  await fs.writeFile(LOG_PATH, `${JSON.stringify(log, null, 2)}\n`);
  return { ...result, action: "replaced" };
}

async function main() {
  const ids = [];
  if (typeof args.id === "string") ids.push(args.id);
  if (typeof args.ids === "string") {
    const text = await fs.readFile(args.ids, "utf8");
    ids.push(
      ...text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    );
  }
  if (!ids.length) {
    console.error("Pass --ids=<file with one artwork id per line> or --id=<artwork id>.");
    process.exit(1);
  }

  const artworks = await readJson(path.join(ROOT, "src/data/artworks.json"));
  const artists = await readJson(path.join(ROOT, "src/data/artists.json"));
  const byId = new Map(artworks.map((w) => [w.id, w]));
  const ctx = {
    takedowns: loadTakedowns(),
    artistsBySlug: new Map(artists.map((a) => [a.slug, a])),
    staging: await fs.mkdtemp(path.join(os.tmpdir(), "commons-refetch-")),
    log: await readJson(LOG_PATH, {}),
    year: new Date().getFullYear(),
  };

  const results = [];
  for (const id of ids) {
    const work = byId.get(id);
    let result;
    try {
      result = work
        ? await refetch(work, ctx)
        : { id, action: "skipped", reason: "not in the catalogue" };
    } catch (err) {
      result = { id, action: "skipped", reason: err.message };
    }
    results.push(result);
    const size = result.width
      ? ` ${result.previous.width} → ${result.width} px, ${(result.bytes / 1e6).toFixed(1)} MB`
      : "";
    console.log(
      `${result.action.padEnd(11)} ${id}${size}${result.reason ? `\n            ${result.reason}` : ""}`,
    );
  }

  const count = (action) => results.filter((r) => r.action === action).length;
  console.log(
    `\n${count("replaced")} replaced, ${count("would fetch")} would be fetched, ${count("skipped")} skipped.`,
  );
  if (typeof args.report === "string") {
    await fs.writeFile(args.report, `${JSON.stringify(results, null, 2)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
