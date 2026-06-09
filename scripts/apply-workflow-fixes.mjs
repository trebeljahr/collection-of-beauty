#!/usr/bin/env node
/**
 * Apply the structured fixes produced by the metadata-cleanup workflow
 * (saved to /tmp/wf-result.json) against the candidates in
 * /tmp/metadata-candidates-filtered.json.
 *
 * Touches: metadata/collection-of-beauty.json, metadata/title-overrides.json,
 * metadata/curator-descriptions.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIDECAR_PATH = path.join(ROOT, "metadata", "collection-of-beauty.json");
const TITLES_PATH = path.join(ROOT, "metadata", "title-overrides.json");
const DESCS_PATH = path.join(ROOT, "metadata", "curator-descriptions.json");

const candidates = JSON.parse(readFileSync("/tmp/metadata-candidates-filtered.json", "utf8"));
const wf = JSON.parse(readFileSync("/tmp/wf-result.json", "utf8"));
const fixes = wf.result.fixes;

// Build candidate-id → candidate lookup
const candById = new Map(candidates.map((c) => [c.id, c]));

// Match each fix to its candidate (exact id, then prefix in either direction)
function findCandidate(fixId) {
  if (candById.has(fixId)) return candById.get(fixId);
  for (const c of candidates) {
    if (fixId.startsWith(c.id) || c.id.startsWith(fixId)) return c;
  }
  return null;
}

const sidecar = JSON.parse(readFileSync(SIDECAR_PATH, "utf8"));
const titles = JSON.parse(readFileSync(TITLES_PATH, "utf8"));
const descs = JSON.parse(readFileSync(DESCS_PATH, "utf8"));

let artistChanges = 0;
let yearChanges = 0;
let dateChanges = 0;
let sidecarDescChanges = 0;
let titleChanges = 0;
let descChanges = 0;
const unmatched = [];

for (const f of fixes) {
  if (f.action !== "fix") continue;
  const c = findCandidate(f.id);
  if (!c) {
    unmatched.push(f.id);
    continue;
  }
  if (c.folder !== "collection-of-beauty") {
    // The current cleanup pass only touches the collection-of-beauty
    // sidecar. Skip any audubon/kunstformen records that may slip in.
    continue;
  }
  const entry = sidecar.entries[c.sidecarFilename];
  if (!entry) {
    unmatched.push(`sidecar:${c.sidecarFilename}`);
    continue;
  }

  if (f.newArtist && entry.artist !== f.newArtist) {
    console.log(`  artist :: ${c.sidecarFilename} :: ${entry.artist} → ${f.newArtist}`);
    entry.artist = f.newArtist;
    artistChanges++;
  }
  if (f.newYear != null && entry.year !== f.newYear) {
    console.log(`  year   :: ${c.sidecarFilename} :: ${entry.year} → ${f.newYear}`);
    entry.year = f.newYear;
    yearChanges++;
  }
  if (f.newDateCreated && entry.date_created !== f.newDateCreated) {
    console.log(`  date   :: ${c.sidecarFilename} :: ${entry.date_created} → ${f.newDateCreated}`);
    entry.date_created = f.newDateCreated;
    dateChanges++;
  }
  if (f.newDescriptionSidecar && entry.description !== f.newDescriptionSidecar) {
    console.log(`  desc-S :: ${c.sidecarFilename}`);
    entry.description = f.newDescriptionSidecar;
    sidecarDescChanges++;
  }

  if (f.englishTitle && titles[c.objectKey] !== f.englishTitle) {
    titles[c.objectKey] = f.englishTitle;
    titleChanges++;
  }
  if (f.curatorDescription && descs[c.id] !== f.curatorDescription) {
    descs[c.id] = f.curatorDescription;
    descChanges++;
  }
}

writeFileSync(SIDECAR_PATH, JSON.stringify(sidecar, null, 2) + "\n");
writeFileSync(TITLES_PATH, JSON.stringify(titles, null, 2) + "\n");
writeFileSync(DESCS_PATH, JSON.stringify(descs, null, 2) + "\n");

console.log(
  `\napply-workflow-fixes: artist=${artistChanges} year=${yearChanges} date=${dateChanges} sidecarDesc=${sidecarDescChanges} titleOverrides=${titleChanges} curatorDescs=${descChanges}`,
);
if (unmatched.length) {
  console.warn("unmatched fixes:", unmatched);
}
