#!/usr/bin/env node
// Merge generated "story" blurbs (and optional year corrections) into the
// per-folder metadata JSON. Stories are written to entry.story so downstream
// consumers (the gallery detail panel) can show a human-written caption.
//
// Input: a JSON file of the form
//
//   {
//     "stories": { "<filename>": "<story text>", ... },
//     "corrections": { "<filename>": { "year": <year>, "note": "..." }, ... }
//   }
//
// The script looks up each filename across every metadata/*.json file and
// stamps the story onto the matching entry. Unknown filenames are reported
// and left alone.
//
// Usage:
//   node scripts/merge-stories.mjs <input.json> [<input2.json> ...]

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

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node scripts/merge-stories.mjs <input.json> [<input2.json> ...]");
  process.exit(1);
}

// Load every metadata file once and build a reverse index: filename -> (file, entry)
const loaded = new Map(); // metadata filename -> { path, json }
const lookup = new Map(); // image filename -> { file, entry }
for (const mf of METADATA_FILES) {
  const full = path.join(ROOT, "metadata", mf);
  if (!fs.existsSync(full)) continue;
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  loaded.set(mf, { path: full, json });
  if (!json.entries) continue;
  for (const [fn, entry] of Object.entries(json.entries)) {
    lookup.set(fn, { file: mf, entry });
  }
}

let merged = 0;
let corrected = 0;
const missing = [];

for (const input of args) {
  const data = JSON.parse(fs.readFileSync(input, "utf8"));
  const stories = data.stories || {};
  const corrections = data.corrections || {};

  for (const [fn, story] of Object.entries(stories)) {
    const hit = lookup.get(fn);
    if (!hit) {
      missing.push(fn);
      continue;
    }
    hit.entry.story = story;
    merged++;
  }

  for (const [fn, corr] of Object.entries(corrections)) {
    const hit = lookup.get(fn);
    if (!hit) continue;
    if (typeof corr.year === "number") {
      hit.entry.year = corr.year;
      hit.entry.year_source = "story_research";
      corrected++;
    }
  }
}

for (const { path: p, json } of loaded.values()) {
  fs.writeFileSync(p, JSON.stringify(json, null, 2));
}

console.log(`Merged ${merged} stories, applied ${corrected} corrections.`);
if (missing.length) {
  console.log(`Missing ${missing.length} filenames (not in any metadata file):`);
  for (const m of missing) console.log(`  - ${m}`);
}
