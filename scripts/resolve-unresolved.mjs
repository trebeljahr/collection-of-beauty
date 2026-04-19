#!/usr/bin/env node
// Second-pass resolver for entries that the first fetch couldn't find on
// Wikimedia Commons. Tries filename variants (strip NNNpx- thumbnail prefix,
// swap extension case, .jpeg<->.jpg) and re-queries the API in batches.
//
// Reads:   metadata/<folder>.json  (takes entries where resolved=false)
// Writes:  metadata/<folder>.json  (updated in-place, still just the index)
//          metadata/.cache/<folder>/pass2-batch-NNNN.json (cached API responses)
//
// Usage:   node scripts/resolve-unresolved.mjs "Collection of Beauty"

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const USER_AGENT =
  "CollectionOfBeautyMetadata/1.0 (personal archive cataloguing; contact: local user) Node/14";
const API_URL = "https://commons.wikimedia.org/w/api.php";
const BATCH_SIZE = 50;
const DELAY_MS = 250;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsGetJson(url, retry = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
        (res) => {
          const retryAfter = parseInt(res.headers["retry-after"] || "0", 10);
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", async () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.error && parsed.error.code === "maxlag") {
                  if (retry >= MAX_RETRIES) return reject(new Error("maxlag"));
                  await sleep(Math.max((retryAfter || 5) * 1000, 2000));
                  return httpsGetJson(url, retry + 1).then(resolve, reject);
                }
                resolve(parsed);
              } catch (e) {
                reject(e);
              }
            } else if (res.statusCode === 503 || res.statusCode === 429) {
              if (retry >= MAX_RETRIES) return reject(new Error(`HTTP ${res.statusCode}`));
              await sleep(Math.max((retryAfter || 5) * 1000, 2000));
              return httpsGetJson(url, retry + 1).then(resolve, reject);
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        },
      )
      .on("error", reject);
  });
}

function stripHtml(s) {
  if (s == null) return null;
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function emValue(em, key) {
  if (!em || !em[key]) return null;
  return stripHtml(em[key].value);
}

function extractYear(s) {
  if (!s) return null;
  const m = String(s).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return m ? parseInt(m[1], 10) : null;
}

// Given an original filename, produce ordered candidate filenames to try
// against the Wikimedia Commons API. First match wins.
function variantCandidates(original) {
  const variants = new Set();
  // strip NNNpx- thumbnail prefix (if present). Try the stripped base FIRST
  // because Commons never stores files with the thumb prefix in their name,
  // so it's by far the most likely match when present.
  const stripThumb = original.replace(/^\d+px-/, "");
  const bases = stripThumb !== original ? [stripThumb, original] : [original];

  for (const base of bases) {
    variants.add(base);
    // extension variants
    const m = base.match(/^(.*)\.([^.]+)$/);
    if (m) {
      const stem = m[1];
      const ext = m[2];
      const titleCase = ext.charAt(0).toUpperCase() + ext.slice(1).toLowerCase();
      const extVariants = new Set([ext, ext.toLowerCase(), ext.toUpperCase(), titleCase]);
      // map between jpg / jpeg (all cases)
      if (/^jpe?g$/i.test(ext)) {
        for (const e of ["jpg", "JPG", "Jpg", "jpeg", "JPEG", "Jpeg"]) extVariants.add(e);
      }
      if (/^tiff?$/i.test(ext)) {
        for (const e of ["tif", "TIF", "Tif", "tiff", "TIFF", "Tiff"]) extVariants.add(e);
      }
      if (/^png$/i.test(ext)) {
        for (const e of ["png", "PNG", "Png"]) extVariants.add(e);
      }
      for (const ev of extVariants) variants.add(`${stem}.${ev}`);
    }
  }
  // Deterministic order: original first, then stripThumb, then case swaps.
  return Array.from(variants);
}

async function queryBatch(titles) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "extmetadata|url|canonicaltitle|mediatype",
    iiextmetadatafilter:
      "ObjectName|Artist|DateTimeOriginal|LicenseShortName|Copyrighted|UsageTerms|Credit|ImageDescription|LicenseUrl|Permission|AuthorCount|Attribution",
    iiextmetadatalanguage: "en",
    maxlag: "5",
    titles: titles.join("|"),
  });
  return httpsGetJson(`${API_URL}?${params.toString()}`);
}

function pageToEntry(page, originalFilename, variantUsed) {
  if (!page || page.missing || !page.imageinfo || !page.imageinfo[0]) return null;
  const ii = page.imageinfo[0];
  const em = ii.extmetadata || {};
  const title = emValue(em, "ObjectName") || originalFilename.replace(/\.[^.]+$/, "").replace(/_/g, " ");
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
    else if (/^cc/i.test(licenseShort) || /gfdl/i.test(licenseShort)) copyrighted = true;
  }

  return {
    filename: originalFilename,
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
      resolved_via_variant: variantUsed !== originalFilename ? variantUsed : null,
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

async function processFolder(folderName) {
  const indexPath = path.join(ROOT, "metadata", `${folderName}.json`);
  if (!fs.existsSync(indexPath)) {
    console.error(`not found: ${indexPath}`);
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const cacheDir = path.join(ROOT, "metadata", ".cache", folderName);
  fs.mkdirSync(cacheDir, { recursive: true });

  const unresolved = Object.values(index.entries).filter((e) => !e.resolved);
  console.log(`[${folderName}] pass2: ${unresolved.length} unresolved entries to retry`);

  // Build (originalFilename -> ordered candidate list)
  const candidatesByFilename = new Map();
  for (const entry of unresolved) {
    // Include the original filename too — pass 1 may have sent an NFD-encoded
    // form that the API didn't match. We NFC-normalize before sending.
    const cands = variantCandidates(entry.filename);
    if (cands.length) candidatesByFilename.set(entry.filename, cands);
  }

  // Round-based resolution: each round tries the Nth candidate of each file.
  // Stop when no more candidates remain. In practice 2-3 rounds cover it.
  const maxRounds = 5;
  const resolvedByFilename = new Map(); // filename -> pageToEntry result
  const remaining = new Map(candidatesByFilename); // copy

  for (let round = 0; round < maxRounds; round++) {
    if (remaining.size === 0) break;
    // Pick this round's candidate per file
    const titlesToTry = [];
    const titleToFilename = new Map();
    for (const [filename, cands] of remaining) {
      if (cands[round] == null) continue;
      // NFC-normalize to avoid macOS NFD -> Wikimedia NFC mismatch
      const title = ("File:" + cands[round].replace(/ /g, "_")).normalize("NFC");
      titlesToTry.push(title);
      titleToFilename.set(title, { filename, variant: cands[round] });
    }
    if (titlesToTry.length === 0) {
      // skip this round if everyone is out of candidates at this index
      continue;
    }
    console.log(`[${folderName}] pass2 round ${round + 1}: querying ${titlesToTry.length} candidates`);

    // batch
    for (let i = 0; i < titlesToTry.length; i += BATCH_SIZE) {
      const batch = titlesToTry.slice(i, i + BATCH_SIZE);
      const cacheFile = path.join(
        cacheDir,
        `pass2-r${round}-batch-${String(Math.floor(i / BATCH_SIZE)).padStart(4, "0")}.json`,
      );
      let payload;
      if (fs.existsSync(cacheFile)) {
        payload = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      } else {
        payload = await queryBatch(batch);
        fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
        await sleep(DELAY_MS);
      }

      const normalized = new Map();
      if (payload?.query?.normalized) {
        for (const n of payload.query.normalized) normalized.set(n.from, n.to);
      }
      const pagesByTitle = new Map();
      for (const p of payload?.query?.pages || []) pagesByTitle.set(p.title, p);

      // Follow the normalization chain (MediaWiki can do URL-decode -> NFC -> space normalization across multiple hops)
      const followChain = (t) => {
        const seen = new Set();
        let cur = t;
        while (normalized.has(cur) && !seen.has(cur)) {
          seen.add(cur);
          cur = normalized.get(cur);
        }
        return cur;
      };

      for (const requestedTitle of batch) {
        const canonical = followChain(requestedTitle);
        const page = pagesByTitle.get(canonical);
        const meta = titleToFilename.get(requestedTitle);
        if (!meta) continue;
        const entry = pageToEntry(page, meta.filename, meta.variant);
        if (entry) {
          resolvedByFilename.set(meta.filename, entry);
          remaining.delete(meta.filename); // done, stop trying variants
        }
      }
    }
    console.log(`[${folderName}] pass2 after round ${round + 1}: resolved ${resolvedByFilename.size}, remaining ${remaining.size}`);
  }

  // Merge back
  for (const [filename, entry] of resolvedByFilename) {
    index.entries[filename] = entry;
  }

  // Recompute counts
  const allEntries = Object.values(index.entries);
  const resolvedCount = allEntries.filter((e) => e.resolved).length;
  index.resolved_count = resolvedCount;
  index.unresolved_count = allEntries.length - resolvedCount;
  index.generated_at = new Date().toISOString();

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  // Rewrite unresolved.txt
  const unresolvedList = allEntries.filter((e) => !e.resolved).map((e) => e.filename);
  const reportPath = path.join(ROOT, "metadata", `${folderName}.unresolved.txt`);
  fs.writeFileSync(reportPath, unresolvedList.join("\n") + (unresolvedList.length ? "\n" : ""));

  console.log(
    `[${folderName}] pass2 done. resolved ${resolvedCount}/${allEntries.length}, unresolved ${unresolvedList.length}`,
  );
}

const folders = process.argv.slice(2);
if (!folders.length) {
  console.error("usage: node resolve-unresolved.mjs <folder> [folder...]");
  process.exit(1);
}
for (const f of folders) await processFolder(f);
