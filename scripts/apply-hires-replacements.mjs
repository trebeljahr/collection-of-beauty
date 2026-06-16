#!/usr/bin/env node
/**
 * Apply curator-approved high-res replacements produced by
 * find-hires-replacements.mjs.
 *
 * Input: a decisions JSON file (default /tmp/replacement-decisions.json):
 *   [
 *     { "id": "<artwork id>", "fileUrl": "<candidate direct url>",
 *       "action": "redownload" | "replace" }
 *   ]
 *
 * - redownload: the candidate is the SAME Commons file we already point
 *   at (we had a downscaled local copy). Overwrite the asset in place;
 *   filename, id, and metadata stay valid. Shrink rebuilds variants on
 *   the next run via mtime.
 *
 * - replace: the candidate is a DIFFERENT Commons file. Download it
 *   under its canonical name, retire the old file to
 *   assets/.rejected/replaced-low-res/, delete the old assets-web
 *   variant dir, and migrate every id-/filename-keyed side table:
 *     curator-descriptions.json   (id -> id)
 *     artwork-dimensions.json     (id -> id)
 *     provenance.json             (filename -> filename)
 *     date-originals.json         (filename -> filename)
 *     title-overrides.json        (objectKey -> objectKey)
 *     content/newsletter/*.md     (artwork id references)
 *
 * After this script: pnpm scrape:fetch collection-of-beauty &&
 * node scripts/normalize-metadata.mjs collection-of-beauty.json &&
 * pnpm assets:shrink --folder=collection-of-beauty && pnpm assets:build-data
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const ASSETS_WEB = path.join(ROOT, "assets-web");
const REJECTED = path.join(ASSETS, ".rejected", "replaced-low-res");
const NEWSLETTER_DIR = path.join(ROOT, "content", "newsletter");
const UA = "CollectionOfBeautyBot/1.0 (personal art catalogue)";

const decisionsPath = process.argv[2] ?? "/tmp/replacement-decisions.json";
const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf8"));
const artworks = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/artworks.json"), "utf8"));
const byId = new Map(artworks.map((w) => [w.id, w]));

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function filenameFromUploadUrl(fileUrl) {
  const parts = new URL(fileUrl).pathname.split("/");
  return decodeURIComponent(parts[parts.length - 1]);
}

function download(url, dest) {
  execFileSync("curl", ["-fSL", "--retry", "3", "--user-agent", UA, "-o", dest, url], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const size = fs.statSync(dest).size;
  if (size < 10_000) throw new Error(`Downloaded file suspiciously small (${size} B): ${url}`);
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function saveJson(p, obj) {
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}

const curatorPath = path.join(ROOT, "metadata/curator-descriptions.json");
const dimsPath = path.join(ROOT, "metadata/artwork-dimensions.json");
const provPath = path.join(ROOT, "metadata/provenance.json");
const dateOrigPath = path.join(ROOT, "metadata/date-originals.json");
const titleOvrPath = path.join(ROOT, "metadata/title-overrides.json");

const curator = loadJson(curatorPath);
const dims = loadJson(dimsPath);
const prov = loadJson(provPath);
const dateOrig = loadJson(dateOrigPath);
let titleOvr = null;
try {
  titleOvr = loadJson(titleOvrPath);
} catch {
  /* optional */
}

fs.mkdirSync(REJECTED, { recursive: true });

const idRenames = []; // { oldId, newId }
let redownloads = 0;
let replacements = 0;

for (const d of decisions) {
  const art = byId.get(d.id);
  if (!art) {
    console.error(`SKIP unknown id: ${d.id}`);
    continue;
  }
  const [folder, ...rest] = art.objectKey.split("/");
  const oldFname = rest.join("/");
  const oldPath = path.join(ASSETS, folder, oldFname);

  if (d.action === "redownload") {
    console.log(`redownload ${d.id}`);
    download(d.fileUrl, oldPath);
    redownloads++;
    continue;
  }

  // action === "replace"
  const newFname = filenameFromUploadUrl(d.fileUrl).replace(/ /g, "_");
  const newPath = path.join(ASSETS, folder, newFname);
  if (fs.existsSync(newPath)) {
    console.error(`SKIP ${d.id}: target file already exists in bucket: ${newFname}`);
    continue;
  }
  console.log(`replace ${d.id}\n  ${oldFname}\n  -> ${newFname}`);
  download(d.fileUrl, newPath);

  // retire old original + variants
  fs.renameSync(oldPath, path.join(REJECTED, oldFname));
  const oldBase = path.basename(oldFname, path.extname(oldFname));
  fs.rmSync(path.join(ASSETS_WEB, folder, oldBase), { recursive: true, force: true });

  // id migration
  const newBase = newFname.replace(/\.[^.]+$/, "");
  const newId = slugify(`${folder}-${newBase}`).slice(0, 120);
  idRenames.push({ oldId: d.id, newId });

  if (curator[d.id] && !curator[newId]) {
    curator[newId] = curator[d.id];
    delete curator[d.id];
  }
  if (dims[d.id] && !dims[newId]) {
    dims[newId] = dims[d.id];
    delete dims[d.id];
  }
  if (prov[oldFname] && !prov[newFname]) {
    prov[newFname] = prov[oldFname];
    // keep the old key too — harmless, and the old file lives on in .rejected
  }
  if (dateOrig[oldFname] && !dateOrig[newFname]) {
    dateOrig[newFname] = dateOrig[oldFname];
  }
  if (titleOvr) {
    const oldKey = `${folder}/${oldFname}`;
    const newKey = `${folder}/${newFname}`;
    if (titleOvr[oldKey] && !titleOvr[newKey]) {
      titleOvr[newKey] = titleOvr[oldKey];
    }
  }
  replacements++;
}

// sort curator keys lexically (file convention)
const sortedCurator = Object.fromEntries(
  Object.entries(curator).sort(([a], [b]) => a.localeCompare(b)),
);
saveJson(curatorPath, sortedCurator);
saveJson(dimsPath, dims);
saveJson(provPath, prov);
saveJson(dateOrigPath, dateOrig);
if (titleOvr) saveJson(titleOvrPath, titleOvr);

// newsletter id references
let newsletterEdits = 0;
if (fs.existsSync(NEWSLETTER_DIR) && idRenames.length) {
  for (const f of fs.readdirSync(NEWSLETTER_DIR).filter((f) => f.endsWith(".md"))) {
    const p = path.join(NEWSLETTER_DIR, f);
    let text = fs.readFileSync(p, "utf8");
    let touched = false;
    for (const { oldId, newId } of idRenames) {
      if (text.includes(oldId)) {
        text = text.split(oldId).join(newId);
        touched = true;
        console.log(`newsletter ${f}: ${oldId} -> ${newId}`);
      }
    }
    if (touched) {
      fs.writeFileSync(p, text);
      newsletterEdits++;
    }
  }
}

console.log(
  `\nDone: ${redownloads} redownloads, ${replacements} replacements, ${newsletterEdits} newsletter files updated.`,
);
console.log("Now run: pnpm scrape:fetch collection-of-beauty && node scripts/normalize-metadata.mjs collection-of-beauty.json && pnpm assets:shrink --folder=collection-of-beauty && pnpm assets:build-data");
