#!/usr/bin/env node
// Fetch metadata for image files from the Wikimedia Commons API.
//
// Usage:
//   node scripts/fetch-wikimedia-metadata.mjs "Collection of Beauty"
//   node scripts/fetch-wikimedia-metadata.mjs audubon_birds
//   node scripts/fetch-wikimedia-metadata.mjs kunstformen_images
//
// Reads files from the given folder (read-only — never touches source files),
// queries Wikimedia Commons in batches of 50 titles, caches raw API responses
// per batch under metadata/.cache/<folder>/batch-<N>.json, and writes the
// merged per-folder JSON to metadata/<folder>.json.
//
// Polite usage:
//   - maxlag=5 on every request
//   - Descriptive User-Agent including contact/purpose
//   - Single-threaded with a small delay between batches
//   - Cached per batch: reruns are free until the cache is deleted
//
// Read-only w.r.t. the source collection. Does not rename or move any file.

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
const BATCH_SIZE = 50; // API max for non-bot users
const DELAY_MS = 250;  // polite delay between batches
const MAX_RETRIES = 5;

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
        const retryAfter = parseInt(res.headers["retry-after"] || "0", 10);
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", async () => {
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
            if (retry >= MAX_RETRIES) return reject(new Error(`HTTP ${res.statusCode}: retries exhausted`));
            const wait = Math.max((retryAfter || 5) * 1000, 2000);
            console.log(`    HTTP ${res.statusCode}, sleeping ${wait}ms (retry ${retry + 1}/${MAX_RETRIES})`);
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

// Collapse a Wikimedia extmetadata field to its plain-text value
function emValue(em, key) {
  if (!em || !em[key]) return null;
  return stripHtml(em[key].value);
}

// Look for the first 4-digit year in a string
function extractYear(s) {
  if (!s) return null;
  const m = String(s).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return m ? parseInt(m[1], 10) : null;
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

async function processFolder(folderName) {
  const folderPath = path.join(ROOT, "assets", folderName);
  if (!fs.existsSync(folderPath)) {
    console.error(`folder not found: ${folderPath}`);
    process.exit(1);
  }

  const cacheDir = path.join(ROOT, "metadata", ".cache", folderName);
  fs.mkdirSync(cacheDir, { recursive: true });

  // 1. list image files (read-only)
  const allFiles = fs
    .readdirSync(folderPath)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  console.log(`[${folderName}] found ${allFiles.length} image files`);

  // 2. batch
  const batches = [];
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    batches.push(allFiles.slice(i, i + BATCH_SIZE));
  }

  // 3. for each batch: cache or fetch
  const rawByFilename = new Map(); // filename -> raw api page (or null)
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const cacheFile = path.join(cacheDir, `batch-${String(bi).padStart(4, "0")}.json`);
    let payload;
    if (fs.existsSync(cacheFile)) {
      payload = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      process.stdout.write(`[${folderName}] batch ${bi + 1}/${batches.length} (cached)\n`);
    } else {
      const titles = batch.map((f) => "File:" + f.replace(/ /g, "_")).join("|");
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
        titles,
      });
      const url = `${API_URL}?${params.toString()}`;
      process.stdout.write(`[${folderName}] batch ${bi + 1}/${batches.length} fetching... `);
      try {
        payload = await httpsGetJson(url);
        fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
        process.stdout.write("ok\n");
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        // don't throw — skip this batch, mark all as unresolved
        payload = { query: { pages: [] } };
      }
      await sleep(DELAY_MS);
    }

    // MediaWiki returns pages keyed by normalized title, plus a "normalized"
    // map telling us which original title maps to which canonical title.
    const normalized = new Map();
    if (payload?.query?.normalized) {
      for (const n of payload.query.normalized) normalized.set(n.from, n.to);
    }
    const pagesByTitle = new Map();
    const pages = payload?.query?.pages || [];
    for (const p of pages) pagesByTitle.set(p.title, p);

    for (const filename of batch) {
      const requested = "File:" + filename.replace(/ /g, "_");
      const canonical = normalized.get(requested) || requested;
      const page = pagesByTitle.get(canonical) || null;
      rawByFilename.set(filename, page);
    }
  }

  // 4. transform raw pages into our schema
  const entries = {};
  const unresolved = [];
  for (const filename of allFiles) {
    const page = rawByFilename.get(filename);
    if (!page || page.missing || !page.imageinfo || !page.imageinfo[0]) {
      const h = parseFilenameHeuristic(filename);
      entries[filename] = {
        filename,
        resolved: false,
        needs_review: true,
        title: h.guessed_title,
        artist: null,
        date_created: h.guessed_year ? String(h.guessed_year) : null,
        source: { type: "unknown", url: null },
        copyright: { copyrighted: null, license: null, notes: "Not found on Wikimedia Commons; needs manual review." },
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
      else if (/^cc/i.test(licenseShort) || /gfdl/i.test(licenseShort) || /copyright/i.test(licenseShort)) copyrighted = true;
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

  // 5. enrich with curated artist DB (if present)
  const artistsDbPath = path.join(ROOT, "scripts", "artists-db.json");
  if (fs.existsSync(artistsDbPath)) {
    const db = JSON.parse(fs.readFileSync(artistsDbPath, "utf8"));
    for (const entry of Object.values(entries)) {
      if (!entry.artist) continue;
      const match = findArtistInDb(entry.artist, db);
      if (match) {
        entry.artist_info = match;
      }
    }
  }

  // 6. write the per-folder json
  const outPath = path.join(ROOT, "metadata", `${folderName}.json`);
  const resolvedCount = Object.values(entries).filter((e) => e.resolved).length;
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
}

function findArtistInDb(rawArtistField, db) {
  // artist field is often HTML-stripped to something like "Vincent van Gogh" or
  // "Claude Monet (1840-1926)" or "user:Foo". Try to match by substring.
  const lc = rawArtistField.toLowerCase();
  for (const entry of db.artists || []) {
    for (const alias of entry.aliases || [entry.name]) {
      if (lc.includes(alias.toLowerCase())) return entry;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------

const folders = process.argv.slice(2);
if (!folders.length) {
  console.error("usage: node fetch-wikimedia-metadata.mjs <folder> [folder...]");
  process.exit(1);
}

for (const f of folders) {
  await processFolder(f);
}
