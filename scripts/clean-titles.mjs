// Pass 2 of the title-cleanup project. Operates on the wikimedia source
// metadata in metadata/<folder>.json (the same files build-data.mjs reads).
//
//   1. Strip wiki/markdown syntax that leaks into title fields:
//        leading `# ` (Wikipedia heading), leading `= ` (wikitext),
//        `[[…]]`, `<ref>…</ref>`, `{{…}}`, leading/trailing whitespace.
//   2. Inspect each entry whose final title would still be predominantly
//      non-Latin even after build-data's `englishFromFilename` heuristic,
//      and write the survivors to metadata/needs_review_titles.txt so a
//      human can supply a real English title.
//
// Run after editing this script; build-data.mjs re-runs the same `cleanTitle`
// transform when the catalog is rebuilt, so the canonical fix lives in the
// metadata files.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, "metadata");
const REVIEW_FILE = path.join(META, "needs_review_titles.txt");

const FOLDERS = ["collection-of-beauty", "audubon-birds", "kunstformen-images"];

// Mirrors the heuristic in scripts/build-data.mjs so the predicted final
// title matches what the pipeline emits.
function isMostlyNonLatin(s) {
  if (!s) return false;
  let nonLatin = 0;
  let letters = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (/[^\s\d.,;:!?'"()&\-]/u.test(ch)) letters++;
    if (code > 0x024f) nonLatin++;
  }
  return letters > 0 && nonLatin / letters > 0.5;
}

function englishFromFilename(fname) {
  if (!fname) return null;
  let base = fname.replace(/\.[^.]+$/, "");
  base = base.replace(/_MET_\w+$/i, "");
  base = base.replace(/_\(\d+\)$/, "");
  const parts = base
    .split(/(?<=[^A-Za-z])-|-(?=[^A-Za-z])/)
    .map((p) => p.replace(/_/g, " ").trim())
    .filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const p of parts) {
    if (/^\d+(px|p)$/i.test(p)) continue;
    const latin = (p.match(/[A-Za-z]/g) || []).length;
    if (latin < 8) continue;
    if (latin / p.length < 0.5) continue;
    if (latin > bestScore) {
      best = p;
      bestScore = latin;
    }
  }
  return best;
}

// Single-pass title scrubber. Returns a tuple [newTitle, kindOfFix].
function scrubTitle(raw) {
  if (typeof raw !== "string") return [raw, null];
  let t = raw;
  let kind = null;

  // Strip wiki / markdown noise.
  const before = t;
  t = t.replace(/^#\s+/, "");
  t = t.replace(/^=+\s*/, "");
  t = t.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  t = t.replace(/<ref[^>]*\/>/g, "");
  t = t.replace(/\{\{[^}]*\}\}/g, "");
  t = t.trim();
  if (t !== before) kind = "syntax";

  return [t, kind];
}

const reviewEntries = [];
const fixSamples = [];
let totalFixed = 0;
let totalReview = 0;

for (const folder of FOLDERS) {
  const file = path.join(META, `${folder}.json`);
  const meta = JSON.parse(await readFile(file, "utf8"));
  let folderFixes = 0;

  for (const [fname, entry] of Object.entries(meta.entries ?? {})) {
    const original = entry.title;
    if (typeof original !== "string") continue;

    const [scrubbed, kind] = scrubTitle(original);
    if (kind && scrubbed !== original) {
      entry.title = scrubbed;
      folderFixes++;
      totalFixed++;
      if (fixSamples.length < 10) {
        fixSamples.push({ folder, fname, before: original, after: scrubbed });
      }
    }

    // Predict whether the final pipeline output will be non-Latin. If yes,
    // the entry needs a human-supplied English/romanized title.
    const final = entry.title;
    const pipelineFallback = englishFromFilename(fname);
    const willStayNonLatin = isMostlyNonLatin(final) && !pipelineFallback;
    if (willStayNonLatin) {
      reviewEntries.push({
        folder,
        filename: fname,
        title: final,
        artist: entry.artist ?? null,
        year: entry.year ?? null,
        commonsUrl: entry.source?.url ?? null,
      });
      totalReview++;
    }
  }

  if (folderFixes > 0) {
    await writeFile(file, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`[clean-titles] ${folder}: ${folderFixes} title rewrites`);
  } else {
    console.log(`[clean-titles] ${folder}: nothing to rewrite`);
  }
}

console.log(`\n[clean-titles] total title rewrites: ${totalFixed}`);
for (const s of fixSamples) {
  console.log(`  ${s.folder}/${s.fname}\n    ${JSON.stringify(s.before)} → ${JSON.stringify(s.after)}`);
}

if (totalReview > 0) {
  reviewEntries.sort((a, b) => a.folder.localeCompare(b.folder) || a.filename.localeCompare(b.filename));
  const lines = [
    "# Titles that remain non-Latin after the build-data pipeline runs",
    "# (no English form in filename, no auto-romanization applied).",
    "# Add an English/romanized title in metadata/<folder>.json for each.",
    "#",
    "# folder | filename | current title | artist | year | commons url",
    "",
  ];
  for (const r of reviewEntries) {
    lines.push(
      [
        r.folder,
        r.filename,
        r.title,
        r.artist ?? "",
        r.year ?? "",
        r.commonsUrl ?? "",
      ]
        .map((s) => String(s).replace(/\s*\|\s*/g, "/"))
        .join(" | "),
    );
  }
  await writeFile(REVIEW_FILE, `${lines.join("\n")}\n`);
  console.log(`\n[clean-titles] flagged ${totalReview} non-Latin titles for review → ${path.relative(ROOT, REVIEW_FILE)}`);
} else {
  console.log("\n[clean-titles] no remaining non-Latin titles");
}
