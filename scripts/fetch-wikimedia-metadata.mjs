#!/usr/bin/env node
// Fetch metadata for image files from the Wikimedia Commons API.
//
// Usage:
//   node scripts/fetch-wikimedia-metadata.mjs "collection-of-beauty"
//   node scripts/fetch-wikimedia-metadata.mjs audubon-birds
//   node scripts/fetch-wikimedia-metadata.mjs kunstformen-images
//   node scripts/fetch-wikimedia-metadata.mjs --dry-run collection-of-beauty
//
// Reads files from the given folder (read-only — never touches source files),
// queries Wikimedia Commons in batches of 50 titles, caches raw API responses
// per batch under metadata/.cache/<folder>/batch-<N>.json, and writes the
// merged per-folder JSON to metadata/<folder>.json.
//
// Before writing, the result is compared with the existing sidecar. A work
// that resolved before and would not now blocks the write (build-data drops
// unresolved entries, so it would leave the site); --allow-regressions
// overrides that. --dry-run fetches and caches as usual, prints the
// comparison and writes no sidecar.
//
// The comparison covers resolution only. A real run rewrites every entry
// from raw Commons values, which replaces the titles, years, artists and
// descriptions later audits fixed by hand in the sidecar. Diff the sidecar
// before rebuilding data.
//
// Polite usage:
//   - maxlag=5 on every request
//   - Descriptive User-Agent including contact/purpose
//   - Single-threaded with a small delay between batches
//   - Cached per batch: reruns are free until the cache is deleted
//
// Read-only w.r.t. the source collection. Does not rename or move any file.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARTISTS_DB_PATH, loadArtistsDb, matchArtist } from "./lib/artist-alias.mjs";
import {
  diffResolution,
  hasImageInfo,
  isNonLatinName,
  mergePayloads,
  readBatchCache,
  requestTitle,
  resolveBatchPages,
  titleKey,
  writeBatchCache,
} from "./lib/commons-batch.mjs";
import { emValue } from "./lib/commons-extmetadata.mjs";
import { loadTakedowns } from "./lib/takedowns.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const USER_AGENT =
  "CollectionOfBeautyMetadata/1.0 (personal archive cataloguing; contact: local user) Node/14";

const API_URL = "https://commons.wikimedia.org/w/api.php";
const BATCH_SIZE = 50; // API max for non-bot users
const DELAY_MS = 250; // polite delay between batches
const MAX_RETRIES = 5;
const MAX_URL_LENGTH = 7000;

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".gif", ".svg"]);

// ---------------------------------------------------------------------------
// tiny helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsGetJson(url, retry = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Encoding": "identity",
          Accept: "application/json",
        },
      },
      (res) => {
        // Handle maxlag backoff (HTTP 200 with error, or 503 retry-after)
        const retryAfter = Number.parseInt(res.headers["retry-after"] || "0", 10);
        // Collect bytes and decode once: appending each Buffer chunk to a
        // string decodes it alone, and a multi-byte character split across
        // two chunks becomes U+FFFD, which corrupted Cyrillic and CJK titles.
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", async () => {
          const data = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              // maxlag exceeded: body has error.code === 'maxlag'
              if (parsed.error && parsed.error.code === "maxlag") {
                if (retry >= MAX_RETRIES) return reject(new Error("maxlag: retries exhausted"));
                const wait = Math.max((retryAfter || 5) * 1000, 2000);
                console.log(`    maxlag, sleeping ${wait}ms (retry ${retry + 1}/${MAX_RETRIES})`);
                await sleep(wait);
                return httpsGetJson(url, retry + 1).then(resolve, reject);
              }
              resolve(parsed);
            } catch (e) {
              reject(e);
            }
          } else if (res.statusCode === 503 || res.statusCode === 429) {
            if (retry >= MAX_RETRIES)
              return reject(new Error(`HTTP ${res.statusCode}: retries exhausted`));
            const wait = Math.max((retryAfter || 5) * 1000, 2000);
            console.log(
              `    HTTP ${res.statusCode}, sleeping ${wait}ms (retry ${retry + 1}/${MAX_RETRIES})`,
            );
            await sleep(wait);
            return httpsGetJson(url, retry + 1).then(resolve, reject);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error("request timeout")));
  });
}

const batchUrl = (filenames) =>
  `${API_URL}?${new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "extmetadata|url|canonicaltitle|mediatype",
    iiextmetadatafilter:
      "ObjectName|Artist|DateTimeOriginal|LicenseShortName|Copyrighted|UsageTerms|Credit|ImageDescription|LicenseUrl|Permission|AuthorCount|Attribution",
    iiextmetadatalanguage: "en",
    maxlag: "5",
    titles: filenames.map(requestTitle).join("|"),
  })}`;

// Commons answers 414 above roughly 8 KB of URL. Non-ASCII names sort to the
// end of the listing and percent-encode to three characters per byte, so the last
// batches (accented, Cyrillic, CJK names) crossed that every time and never
// resolved. Split such a batch into halves and merge the answers, so it is
// still cached as one batch.
async function fetchBatch(filenames) {
  const url = batchUrl(filenames);
  if (url.length <= MAX_URL_LENGTH || filenames.length === 1) return httpsGetJson(url);
  const mid = Math.ceil(filenames.length / 2);
  const a = await fetchBatch(filenames.slice(0, mid));
  await sleep(DELAY_MS);
  const b = await fetchBatch(filenames.slice(mid));
  return mergePayloads(a, b);
}

// Fetch Commons pages for a list of names (filenames, or titles without the
// "File:" prefix), BATCH_SIZE at a time. Each batch is cached at
// <cacheDir>/<prefix>-NNNN.json and reused only when it was written for
// exactly the same names (see readBatchCache): batches are numbered by
// position, so one added file shifts every later batch.
async function fetchPages(names, { cacheDir, prefix, label }) {
  const batches = [];
  for (let i = 0; i < names.length; i += BATCH_SIZE) batches.push(names.slice(i, i + BATCH_SIZE));
  const cacheFileFor = (bi) => path.join(cacheDir, `${prefix}-${String(bi).padStart(4, "0")}.json`);
  const cached = batches.map((batch, bi) => readBatchCache(cacheFileFor(bi), batch));
  const toFetch = cached.filter((c) => c.status !== "hit").length;
  const byStatus = (s) => cached.filter((c) => c.status === s).length;
  console.log(
    `[${label}] ${batches.length} batches: ${batches.length - toFetch} cached, ${toFetch} to fetch (${byStatus("missing")} missing, ${byStatus("legacy")} legacy, ${byStatus("stale")} written for other files)`,
  );

  const pages = new Map(); // name -> raw api page (or null)
  const failed = []; // batch numbers whose fetch never returned
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    let payload;
    if (cached[bi].status === "hit") {
      payload = cached[bi].payload;
    } else {
      process.stdout.write(`[${label}] batch ${bi + 1}/${batches.length} fetching... `);
      try {
        payload = await fetchBatch(batch);
        writeBatchCache(cacheFileFor(bi), batch, payload);
        process.stdout.write("ok\n");
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        // Keep going so the remaining batches still populate the cache (a
        // re-run then only re-queries what failed), but remember the failure:
        // substituting an empty page set here would write up to 50 real works
        // out as needs_review, and build-data drops those from the catalogue.
        // The folder JSON is not rewritten at all when this list is non-empty.
        failed.push(bi + 1);
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(DELAY_MS);
    }
    for (const [name, page] of resolveBatchPages(payload, batch)) pages.set(name, page);
  }
  return { pages, failed };
}

// Collapse a Wikimedia extmetadata field to its plain-text value

// Look for the first 4-digit year in a string
function extractYear(s) {
  if (!s) return null;
  const m = String(s).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return m ? Number.parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// filename -> title parsing heuristic (used as a fallback when API has nothing)

function parseFilenameHeuristic(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  return {
    guessed_title: base,
    guessed_year: extractYear(base),
  };
}

// ---------------------------------------------------------------------------
// main per-folder pipeline

async function processFolder(folderName, options) {
  const folderPath = path.join(ROOT, "assets", folderName);
  if (!fs.existsSync(folderPath)) {
    console.error(`folder not found: ${folderPath}`);
    process.exit(1);
  }

  const cacheDir = path.join(ROOT, "metadata", ".cache", folderName);
  fs.mkdirSync(cacheDir, { recursive: true });

  // 1. list image files (read-only)
  // Taken-down works (metadata/takedowns.json) get no sidecar entry, so
  // build-data has nothing to catalogue even if the original is back on disk.
  const takedowns = loadTakedowns();
  const allFiles = fs
    .readdirSync(folderPath)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .filter((f) => !takedowns.has(folderName, f))
    .sort();

  console.log(`[${folderName}] found ${allFiles.length} image files`);

  // 2 + 3. batch the files and fetch each batch, or reuse its cache.
  const outPath = path.join(ROOT, "metadata", `${folderName}.json`);
  const currentEntries = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, "utf8")).entries
    : {};
  const fetched = await fetchPages(allFiles, { cacheDir, prefix: "batch", label: folderName });
  const rawByFilename = fetched.pages; // filename -> raw api page (or null)
  const failedBatches = fetched.failed;

  // 3a. A file with no Commons page under its own name may still be resolved
  //     in the sidecar: resolve-unresolved.mjs matches those by search and
  //     records the page it found as source.canonical_title. Looking up only
  //     the filename wrote all of them back out as needs_review, so fetch
  //     those pages by the recorded title instead.
  const currentByNfc = new Map(
    Object.entries(currentEntries).map(([k, v]) => [k.normalize("NFC"), v]),
  );
  const aliasOf = new Map(); // filename -> recorded title, without "File:"
  for (const filename of allFiles) {
    if (hasImageInfo(rawByFilename.get(filename))) continue;
    const old = currentByNfc.get(filename.normalize("NFC"));
    const recorded = old?.resolved ? old.source?.canonical_title : null;
    if (!recorded || titleKey(recorded) === titleKey(requestTitle(filename))) continue;
    // A few titles were recorded percent-encoded ("%22" for a quote), which
    // Commons rejects as invalid characters.
    let title = recorded;
    try {
      title = decodeURIComponent(recorded);
    } catch {}
    aliasOf.set(filename, title.replace(/^file:/i, ""));
  }
  const kept = []; // resolved before, and neither page exists on Commons now
  if (aliasOf.size) {
    console.log(
      `[${folderName}] ${aliasOf.size} file(s) have no page under their own name; fetching the page recorded in the sidecar`,
    );
    const aliases = [...new Set(aliasOf.values())].sort();
    const byAlias = await fetchPages(aliases, {
      cacheDir,
      prefix: "recorded",
      label: `${folderName} recorded`,
    });
    failedBatches.push(...byAlias.failed.map((n) => `recorded ${n}`));
    for (const [filename, alias] of aliasOf) {
      const page = byAlias.pages.get(alias);
      if (hasImageInfo(page)) rawByFilename.set(filename, page);
      else kept.push(filename);
    }
  }

  // 3b. bail before touching the sidecar if any batch never came back. Every
  // file in a failed batch would be written as needs_review — indistinguishable
  // from "Commons has never heard of this file" — and the whole-file rewrite
  // would also drop the curation fix-bad-metadata.mjs applied to the entries
  // that *did* resolve. A re-run costs only the failed batches; the successful
  // ones are already cached.
  if (failedBatches.length) {
    console.error(
      `[${folderName}] ${failedBatches.length} batch(es) failed (${failedBatches.join(", ")}) — NOT writing metadata/${folderName}.json. Re-run to retry just those batches.`,
    );
    return false;
  }

  // 4. transform raw pages into our schema
  const entries = {};
  const unresolved = [];
  const keptSet = new Set(kept);
  for (const filename of allFiles) {
    const page = rawByFilename.get(filename);
    // The page this work was resolved to has gone from Commons (renamed,
    // or deleted). Unpublishing it is a decision for a person, so the
    // existing entry stays and the run lists it.
    if (keptSet.has(filename)) {
      entries[filename] = currentByNfc.get(filename.normalize("NFC"));
      continue;
    }
    if (!hasImageInfo(page)) {
      const h = parseFilenameHeuristic(filename);
      entries[filename] = {
        filename,
        resolved: false,
        needs_review: true,
        title: h.guessed_title,
        artist: null,
        date_created: h.guessed_year ? String(h.guessed_year) : null,
        source: { type: "unknown", url: null },
        copyright: {
          copyrighted: null,
          license: null,
          notes: "Not found on Wikimedia Commons; needs manual review.",
        },
      };
      unresolved.push(filename);
      continue;
    }
    const ii = page.imageinfo[0];
    const em = ii.extmetadata || {};
    const title = emValue(em, "ObjectName") || parseFilenameHeuristic(filename).guessed_title;
    const artist = emValue(em, "Artist");
    const dateOriginal = emValue(em, "DateTimeOriginal");
    const licenseShort = emValue(em, "LicenseShortName");
    const licenseUrl = emValue(em, "LicenseUrl");
    const usageTerms = emValue(em, "UsageTerms");
    const copyrightedRaw = emValue(em, "Copyrighted");
    const credit = emValue(em, "Credit");
    const description = emValue(em, "ImageDescription");
    const permission = emValue(em, "Permission");
    const attribution = emValue(em, "Attribution");

    let copyrighted = null;
    if (copyrightedRaw) {
      if (/^true$/i.test(copyrightedRaw)) copyrighted = true;
      else if (/^false$/i.test(copyrightedRaw)) copyrighted = false;
    }
    if (copyrighted == null && licenseShort) {
      if (/public domain/i.test(licenseShort) || /^pd/i.test(licenseShort)) copyrighted = false;
      else if (
        /^cc/i.test(licenseShort) ||
        /gfdl/i.test(licenseShort) ||
        /copyright/i.test(licenseShort)
      )
        copyrighted = true;
    }

    entries[filename] = {
      filename,
      resolved: true,
      needs_review: false,
      title,
      artist,
      date_created: dateOriginal,
      year: extractYear(dateOriginal),
      description,
      source: {
        type: "Wikimedia Commons",
        canonical_title: ii.canonicaltitle || page.title,
        url:
          "https://commons.wikimedia.org/wiki/" +
          encodeURIComponent((page.title || "").replace(/ /g, "_")),
        file_url: ii.url || null,
        credit,
        permission,
        attribution,
      },
      copyright: {
        copyrighted,
        license_short: licenseShort,
        license_url: licenseUrl,
        usage_terms: usageTerms,
      },
    };
  }

  // 5. enrich with curated artist DB (if present). The match rules live in
  //    scripts/lib/artist-alias.mjs, shared with build-data and
  //    normalize-metadata; the bare substring match this used to do filed
  //    "Pieter Brueghel the Younger" under the Elder's single-token alias.
  if (fs.existsSync(ARTISTS_DB_PATH)) {
    const { byAlias } = loadArtistsDb();
    for (const entry of Object.values(entries)) {
      if (!entry.artist) continue;
      const match = matchArtist(entry.artist, byAlias);
      if (match) {
        entry.artist_info = match;
      }
    }
  }

  // 6. compare with the sidecar on disk. build-data drops needs_review
  //    entries, so every resolved:true -> resolved:false here unpublishes a
  //    work. Refuse to write those unless asked; --dry-run only reports.
  const resolvedCount = Object.values(entries).filter((e) => e.resolved).length;
  const diff = diffResolution(currentEntries, entries);
  const currentResolved = Object.values(currentEntries).filter((e) => e.resolved).length;
  const nonLatinFiles = allFiles.filter(isNonLatinName);
  reportDiff(folderName, diff, {
    currentResolved,
    resolvedCount,
    total: allFiles.length,
    nonLatin: {
      total: nonLatinFiles.length,
      before: nonLatinFiles.filter((f) => currentByNfc.get(f.normalize("NFC"))?.resolved).length,
      after: nonLatinFiles.filter((f) => entries[f].resolved).length,
    },
  });
  console.log(
    `[${folderName}] kept from the sidecar, page gone from Commons (check by hand): ${kept.length}`,
  );
  for (const f of kept) {
    const url = currentByNfc.get(f.normalize("NFC"))?.source?.url;
    console.log(`[${folderName}]     ${f} (${url})`);
  }

  if (options.dryRun) {
    console.log(`[${folderName}] --dry-run: metadata/${folderName}.json not written`);
    return { written: false, regressed: diff.regressed.length };
  }
  if (diff.regressed.length && !options.allowRegressions) {
    console.error(
      `[${folderName}] ${diff.regressed.length} resolved work(s) would become unresolved — NOT writing metadata/${folderName}.json. Pass --allow-regressions to write anyway.`,
    );
    return { written: false, regressed: diff.regressed.length };
  }

  // 7. write the per-folder json
  const output = {
    folder: folderName,
    kind: "wikimedia_image_collection",
    generated_at: new Date().toISOString(),
    source_api: "Wikimedia Commons action=query&prop=imageinfo",
    file_count: allFiles.length,
    resolved_count: resolvedCount,
    unresolved_count: allFiles.length - resolvedCount,
    entries,
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(
    `[${folderName}] wrote ${outPath} (resolved ${resolvedCount}/${allFiles.length}, unresolved ${unresolved.length})`,
  );
  if (unresolved.length) {
    const reportPath = path.join(ROOT, "metadata", `${folderName}.unresolved.txt`);
    fs.writeFileSync(reportPath, unresolved.join("\n") + "\n");
    console.log(`[${folderName}] unresolved list -> ${reportPath}`);
  }
  return { written: true, regressed: diff.regressed.length };
}

function reportDiff(folderName, diff, { currentResolved, resolvedCount, total, nonLatin }) {
  const p = `[${folderName}]`;
  const list = (label, items, fmt = (x) => x) => {
    console.log(`${p} ${label}: ${items.length}`);
    for (const x of items.slice(0, 25)) console.log(`${p}     ${fmt(x)}`);
    if (items.length > 25) console.log(`${p}     … ${items.length - 25} more`);
  };
  console.log(
    `${p} resolved: ${currentResolved} in sidecar -> ${resolvedCount}/${total} after this run`,
  );
  list("resolved -> unresolved (regressions)", diff.regressed);
  list("unresolved -> resolved", diff.recovered);
  list(
    "resolved to a different page",
    diff.retargeted,
    (r) => `${r.filename}: ${r.from} -> ${r.to}`,
  );
  list("new files, not in sidecar", diff.added);
  list("in sidecar, not in file list (a write drops them)", diff.dropped);
  // A past refetch lost Cyrillic/CJK entries, so call those out on their own.
  const lost = diff.regressed.filter(isNonLatinName);
  console.log(
    `${p} Cyrillic/CJK files: ${nonLatin.total}, resolved ${nonLatin.before} in sidecar -> ${nonLatin.after}; regressions: ${lost.length}`,
  );
  for (const f of lost) console.log(`${p}     ${f}`);
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes("--dry-run"),
  allowRegressions: args.includes("--allow-regressions"),
};
const folders = args.filter((a) => !a.startsWith("--"));
if (!folders.length) {
  console.error(
    "usage: node fetch-wikimedia-metadata.mjs [--dry-run] [--allow-regressions] <folder> [folder...]",
  );
  process.exit(1);
}

const writtenFolders = [];
const failedFolders = [];
let regressions = 0;
for (const f of folders) {
  const result = await processFolder(f, options);
  if (result) regressions += result.regressed;
  if (result?.written) writtenFolders.push(f);
  else if (!options.dryRun || !result) failedFolders.push(f);
}

if (options.dryRun) {
  console.log(`\n--dry-run: ${regressions} regression(s) across ${folders.length} folder(s)`);
  if (failedFolders.length) {
    console.error(`fetch failed for: ${failedFolders.join(", ")} (report above is incomplete)`);
  }
  process.exit(regressions || failedFolders.length ? 1 : 0);
}

// Post-process: normalize the freshly-written JSON so consumers always see
// clean English titles + translations map and a recovered year. Without this
// step, the raw Commons ObjectName string still contains `label QS:Lxx,"..."`
// multilingual markup. Only folders whose JSON was actually rewritten.
const normalizerPath = path.join(__dirname, "normalize-metadata.mjs");
if (fs.existsSync(normalizerPath) && writtenFolders.length) {
  const normalizerArgs = writtenFolders.map((f) => `${f}.json`);
  console.log(`\nRunning normalize-metadata.mjs for: ${normalizerArgs.join(", ")}`);
  const r = spawnSync(process.execPath, [normalizerPath, ...normalizerArgs], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`normalize-metadata.mjs exited with status ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

// Exit non-zero when a folder was skipped, so a `scrape:fetch && …` chain
// stops here rather than shrinking and building from stale metadata.
if (failedFolders.length) {
  console.error(
    `\nfetch-wikimedia-metadata: ${failedFolders.length} folder(s) not written: ${failedFolders.join(", ")}`,
  );
  process.exit(1);
}
