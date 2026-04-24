#!/usr/bin/env node
// Merge the Audubon and Kunstformen story outputs into their metadata files.
// These batches use a simpler schema: { stories: { "<fn>": "<text>" } } with
// no `corrections` block (year data for these is solid). Runs independently
// of scripts/merge-all.mjs because the inputs live under different paths.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function listOutputs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".out.json")).map((f) => path.join(dir, f));
}

function mergeInto(metaRel, inputs) {
  const full = path.join(ROOT, "metadata", metaRel);
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  let merged = 0;
  let missing = [];
  for (const input of inputs) {
    const data = JSON.parse(fs.readFileSync(input, "utf8"));
    const stories = data.stories || {};
    for (const [fn, story] of Object.entries(stories)) {
      const direct = json.entries[fn];
      const nfc = json.entries[fn.normalize("NFC")];
      const nfd = json.entries[fn.normalize("NFD")];
      const target = direct || nfc || nfd;
      if (!target) {
        missing.push(fn);
        continue;
      }
      target.story = story;
      merged++;
    }
  }
  fs.writeFileSync(full, JSON.stringify(json, null, 2));
  console.log(`[${metaRel}] merged ${merged} stories` + (missing.length ? `, missing ${missing.length}` : ""));
  if (missing.length) missing.slice(0, 3).forEach((m) => console.log(`   missing: ${m}`));
}

mergeInto("audubon-birds.json", listOutputs("/tmp/pilot/audubon"));
mergeInto("kunstformen-images.json", listOutputs("/tmp/pilot/kunstformen"));
