#!/usr/bin/env node
// Merge artist briefings and per-work stories into metadata JSON.
//
// Artist briefings: `{ "briefings": { "<canonical>": "<text|null>" } }`
//   → written to d.artist_briefings[<canonical>]
//
// Per-work stories:  `{ "stories": { "<filename>": "<text>" }, "corrections": {} }`
//   → written to entry.story; corrections apply to entry.year (+ year_source)
//
// Usage:
//   node scripts/merge-all.mjs
//     (reads everything under /tmp/pilot/artists/*.out.json and
//      /tmp/pilot/tier_*/*.out.json)
//
//   node scripts/merge-all.mjs <file> [<file>...]
//     (reads specific files)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const METADATA_FILES = [
  "collection-of-beauty.json",
  "audubon-birds.json",
  "kunstformen-images.json",
];

const PILOT_DIR = "/tmp/pilot";
const ARTIST_GLOB_DIRS = [path.join(PILOT_DIR, "artists")];
const STORY_GLOB_DIRS = [
  path.join(PILOT_DIR, "tier_a"),
  path.join(PILOT_DIR, "tier_b"),
  path.join(PILOT_DIR, "tier_c"),
];

function listOutputs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".out.json"))
    .map((f) => path.join(dir, f));
}

const args = process.argv.slice(2);
const artistFiles = args.length
  ? args.filter((f) => f.includes("/artists/"))
  : ARTIST_GLOB_DIRS.flatMap(listOutputs);
const storyFiles = args.length
  ? args.filter((f) => !f.includes("/artists/"))
  : STORY_GLOB_DIRS.flatMap(listOutputs);

// Load every metadata file once and build a reverse index keyed by both NFC
// and NFD forms of the filename. macOS filesystems and the original Commons
// filenames sometimes disagree on Unicode normalization (ü as a single
// precomposed code point vs. u + combining-umlaut); accepting both lets a
// batch input from either source resolve to the canonical entry.
const loaded = new Map();
const lookup = new Map();
for (const mf of METADATA_FILES) {
  const full = path.join(ROOT, "metadata", mf);
  if (!fs.existsSync(full)) continue;
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  loaded.set(mf, { path: full, json });
  if (!json.entries) continue;
  for (const [fn, entry] of Object.entries(json.entries)) {
    lookup.set(fn, { file: mf, entry });
    const nfc = fn.normalize("NFC");
    const nfd = fn.normalize("NFD");
    if (nfc !== fn) lookup.set(nfc, { file: mf, entry });
    if (nfd !== fn) lookup.set(nfd, { file: mf, entry });
  }
}

function findEntry(fn) {
  return (
    lookup.get(fn) ||
    lookup.get(fn.normalize("NFC")) ||
    lookup.get(fn.normalize("NFD")) ||
    null
  );
}

// --- merge artist briefings ----------------------------------------------

// We store briefings as a top-level map on collection-of-beauty.json (the
// main catalogue); all three metadata files read from it. Audubon and
// Kunstformen get their own artist-level briefings in-place if present.
const mainMeta = loaded.get("collection-of-beauty.json");
if (mainMeta) {
  mainMeta.json.artist_briefings = mainMeta.json.artist_briefings || {};
}

let briefingsMerged = 0;
let briefingsNull = 0;
for (const f of artistFiles) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    console.error(`skip unreadable ${f}: ${e.message}`);
    continue;
  }
  const briefings = data.briefings || {};
  for (const [canonical, text] of Object.entries(briefings)) {
    if (text == null) {
      briefingsNull++;
      continue;
    }
    if (mainMeta) mainMeta.json.artist_briefings[canonical] = text;
    briefingsMerged++;
  }
}

// --- merge stories and corrections ----------------------------------------

let storiesMerged = 0;
let correctionsApplied = 0;
const missing = [];

for (const f of storyFiles) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    console.error(`skip unreadable ${f}: ${e.message}`);
    continue;
  }
  const stories = data.stories || {};
  const corrections = data.corrections || {};

  for (const [fn, story] of Object.entries(stories)) {
    const hit = findEntry(fn);
    if (!hit) {
      missing.push(fn);
      continue;
    }
    hit.entry.story = story;
    storiesMerged++;
  }
  for (const [fn, corr] of Object.entries(corrections)) {
    const hit = findEntry(fn);
    if (!hit) continue;
    if (typeof corr.year === "number") {
      hit.entry.year = corr.year;
      hit.entry.year_source = "story_research";
      if (corr.note) hit.entry.year_note = corr.note;
      correctionsApplied++;
    }
  }
}

for (const { path: p, json } of loaded.values()) {
  fs.writeFileSync(p, JSON.stringify(json, null, 2));
}

console.log(
  `Artist briefings: merged ${briefingsMerged}, skipped ${briefingsNull} null.`,
);
console.log(
  `Stories: merged ${storiesMerged}, applied ${correctionsApplied} year corrections.`,
);
if (missing.length) {
  console.log(
    `Missing ${missing.length} filenames (sample: ${missing.slice(0, 3).join(", ")})`,
  );
}
