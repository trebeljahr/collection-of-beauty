#!/usr/bin/env node
// Fetch real provenance data for each Commons artwork.
//
// Usage:
//   node scripts/fetch-provenance.mjs <folder> [folder...]
//   node scripts/fetch-provenance.mjs collection-of-beauty audubon-birds
//   node scripts/fetch-provenance.mjs collection-of-beauty --limit 20
//
// Two phases:
//   A. Wikidata SPARQL — for each Commons filename, look up the painting's
//      Wikidata item via wdt:P18 and pull P195 (collection), P276 (current
//      location), P217 (inventory number), P973 (described-at URL).
//   B. Commons autonumber-link scrape — for files without a Wikidata hit,
//      fetch the file page HTML and pull URLs out of the rendered Source
//      field's `<a class="external autonumber">[N]</a>` markers. These
//      are the targets the orphan `[1]` refs in source.credit point to,
//      so we recover real provenance URLs even without Wikidata.
//
// Polite to Wikimedia / WDQS:
//   - Descriptive User-Agent (contact + purpose)
//   - WDQS: 50-filename batches, ~750ms inter-batch delay, 60s timeout
//   - Commons parse: 600ms inter-request delay, single-threaded
//     (250ms triggers HTTP 429 after a few hundred calls)
//   - Per-batch caching under metadata/.cache/provenance/<folder>/
//
// Output:
//   metadata/provenance.json
//     {
//       "<filename.jpg>": {
//         wikidataId: "Q...",
//         wikidataUrl: "https://www.wikidata.org/wiki/Q...",
//         collection: "Musée d'Orsay" | null,
//         collectionWikidataId: "Q..." | null,
//         location: "Paris" | null,
//         inventory: "RF 1973-90" | null,
//         describedAt: "https://..." | null,
//         sourceLinks: [{ label: "metmuseum.org", url: "https://..." }]
//       },
//       ...
//     }

import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const USER_AGENT =
  "CollectionOfBeautyProvenance/1.0 (personal archive provenance enrichment; contact: local user) Node";

const WDQS_URL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const SPARQL_BATCH_SIZE = 50;
const SPARQL_DELAY_MS = 750;
// 250ms inter-request triggers HTTP 429 from the parse API after a few
// hundred requests; 600ms keeps us under the threshold reliably across
// thousands of pages.
const COMMONS_DELAY_MS = 600;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Generic HTTPS GET/POST with retry on 429/503

function httpsRequest(url, { method = "GET", body = null, headers = {} } = {}, retry = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Encoding": "identity",
          ...headers,
        },
      },
      (res) => {
        const retryAfter = Number.parseInt(res.headers["retry-after"] || "0", 10);
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", async () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body: data });
          } else if (res.statusCode === 429 || res.statusCode === 503 || res.statusCode === 504) {
            if (retry >= MAX_RETRIES) {
              reject(new Error(`HTTP ${res.statusCode} after ${MAX_RETRIES} retries`));
              return;
            }
            const wait = Math.max((retryAfter || 5) * 1000, 2000) * (retry + 1);
            console.log(`    HTTP ${res.statusCode}, sleeping ${wait}ms (retry ${retry + 1})`);
            await sleep(wait);
            httpsRequest(url, { method, body, headers }, retry + 1).then(resolve, reject);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error("request timeout")));
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Phase A — Wikidata SPARQL batch

// Wikidata's wdt:P18 is typed commonsMedia and stored as a
// Special:FilePath URI (http, not https). The filename is encoded the
// way MediaWiki's wfUrlencode does it: encodeURIComponent() leaves a
// handful of "sub-delim" characters unescaped (' ( ) * ! ~) that
// Wikidata DOES escape — so a bare encodeURIComponent for a file
// containing apostrophes silently misses every match. Force-encode
// those too, and we line up byte-for-byte with the stored value.
function filePathUri(filename) {
  const encoded = encodeURIComponent(filename).replace(
    /['()*!~]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return "http://commons.wikimedia.org/wiki/Special:FilePath/" + encoded;
}

// Build a SPARQL query that pulls provenance fields for a batch of
// Commons filenames (passed in as Special:FilePath URIs). One row per
// ?image × OPTIONAL combination — we collapse to one record per image
// downstream.
function buildSparql(filenames) {
  const values = filenames.map((f) => `<${filePathUri(f)}>`).join("\n      ");
  return `SELECT ?image ?item ?collection ?collectionLabel ?location ?locationLabel ?inv ?desc WHERE {
  VALUES ?image {
      ${values}
  }
  ?item wdt:P18 ?image .
  OPTIONAL { ?item wdt:P195 ?collection . }
  OPTIONAL { ?item wdt:P276 ?location . }
  OPTIONAL { ?item wdt:P217 ?inv . }
  OPTIONAL { ?item wdt:P973 ?desc . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

async function sparqlBatch(filenames) {
  const query = buildSparql(filenames);
  const body = "query=" + encodeURIComponent(query);
  const res = await httpsRequest(WDQS_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
  });
  return JSON.parse(res.body);
}

// Collapse Wikidata SPARQL bindings (one row per OPTIONAL combination)
// into one record per image. First non-null value wins for each field.
function foldBindings(bindings) {
  const byImage = new Map();
  for (const b of bindings) {
    const image = b.image?.value;
    if (!image) continue;
    let rec = byImage.get(image);
    if (!rec) {
      rec = {
        wikidataId: null,
        wikidataUrl: null,
        collection: null,
        collectionWikidataId: null,
        location: null,
        inventory: null,
        describedAt: null,
      };
      byImage.set(image, rec);
    }
    if (!rec.wikidataId && b.item?.value) {
      const qid = b.item.value.replace(/^.*\/entity\//, "");
      rec.wikidataId = qid;
      rec.wikidataUrl = `https://www.wikidata.org/wiki/${qid}`;
    }
    if (!rec.collection && b.collectionLabel?.value) rec.collection = b.collectionLabel.value;
    if (!rec.collectionWikidataId && b.collection?.value) {
      rec.collectionWikidataId = b.collection.value.replace(/^.*\/entity\//, "");
    }
    if (!rec.location && b.locationLabel?.value) rec.location = b.locationLabel.value;
    if (!rec.inventory && b.inv?.value) rec.inventory = b.inv.value;
    if (!rec.describedAt && b.desc?.value) rec.describedAt = b.desc.value;
  }
  return byImage;
}

// ---------------------------------------------------------------------------
// Phase B — Commons autonumber link scrape (recovers footnote URLs)

async function commonsParseHtml(filename) {
  const params = new URLSearchParams({
    action: "parse",
    page: "File:" + filename.replace(/ /g, "_"),
    prop: "text",
    disabletoc: "1",
    disablelimitreport: "1",
    disableeditsection: "1",
    format: "json",
    formatversion: "2",
    maxlag: "5",
  });
  const res = await httpsRequest(`${COMMONS_API}?${params}`, {
    headers: { Accept: "application/json" },
  });
  const parsed = JSON.parse(res.body);
  return parsed?.parse?.text ?? null;
}

// Pull source URLs from the file page. The `[1]` markers in
// source.credit aren't <ref> footnotes — they're MediaWiki "autonumber"
// external links: wikitext `[http://example.com]` renders as
// `<a class="external autonumber" href="...">[1]</a>`. The autonumber
// class is specific enough that the simple page-wide match is reliable
// (other external links on file pages — authority-control IDs,
// licensing template footers — render with class="external text" or
// class="external mw-numlink", never autonumber).
function extractCiteNoteUrls(html) {
  if (!html) return [];
  const urls = [];
  const seen = new Set();
  const re = /<a [^>]*class="[^"]*\bautonumber\b[^"]*"[^>]*href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const url = decodeHtmlEntities(m[1]);
    if (seen.has(url)) continue;
    if (/\.wikipedia\.org\//.test(url) || /\.wikimedia\.org\//.test(url)) continue;
    if (/\bcreativecommons\.org\b/.test(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function urlToLabel(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Per-folder pipeline

async function processFolder(folderName, opts) {
  const inputPath = path.join(ROOT, "metadata", `${folderName}.json`);
  if (!fs.existsSync(inputPath)) {
    console.error(`metadata not found: ${inputPath}`);
    return {};
  }
  const meta = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const filenames = [];
  for (const [filename, entry] of Object.entries(meta.entries || {})) {
    if (!entry.resolved) continue;
    const canonical = entry.source?.canonical_title;
    if (!canonical) continue;
    // strip "File:" prefix; Wikidata's wdt:P18 stores the bare filename
    const bare = canonical.replace(/^File:/, "");
    filenames.push({ key: filename, wdName: bare });
  }
  if (opts.limit) filenames.splice(opts.limit);

  console.log(`[${folderName}] ${filenames.length} resolved entries`);

  const cacheDir = path.join(ROOT, "metadata", ".cache", "provenance", folderName);
  fs.mkdirSync(cacheDir, { recursive: true });

  // ── Phase A: Wikidata SPARQL ────────────────────────────────────────
  const provenance = {};
  for (let i = 0; i < filenames.length; i += SPARQL_BATCH_SIZE) {
    const batch = filenames.slice(i, i + SPARQL_BATCH_SIZE);
    const idx = String(i / SPARQL_BATCH_SIZE).padStart(4, "0");
    const cacheFile = path.join(cacheDir, `wd-${idx}.json`);
    let bindings;
    if (fs.existsSync(cacheFile)) {
      bindings = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      process.stdout.write(`[${folderName}] WD batch ${idx} (cached)\n`);
    } else {
      try {
        process.stdout.write(`[${folderName}] WD batch ${idx} fetching... `);
        const json = await sparqlBatch(batch.map((b) => b.wdName));
        bindings = json.results?.bindings ?? [];
        fs.writeFileSync(cacheFile, JSON.stringify(bindings, null, 2));
        process.stdout.write(`${bindings.length} bindings\n`);
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        bindings = [];
      }
      await sleep(SPARQL_DELAY_MS);
    }

    const byImage = foldBindings(bindings);
    for (const { key, wdName } of batch) {
      const uri = filePathUri(wdName);
      const rec = byImage.get(uri);
      if (rec) provenance[key] = { ...rec, sourceLinks: [] };
    }
  }

  const wdHits = Object.keys(provenance).length;
  console.log(`[${folderName}] Wikidata hits: ${wdHits}/${filenames.length}`);

  // ── Phase B: Commons autonumber-link scrape (only for misses) ───────
  const misses = filenames.filter(({ key }) => !provenance[key]);
  console.log(`[${folderName}] scraping cite_notes for ${misses.length} files without WD data`);
  let scraped = 0;
  for (const { key, wdName } of misses) {
    const cacheFile = path.join(cacheDir, `cn-${encodeURIComponent(wdName).slice(0, 200)}.json`);
    let urls;
    if (fs.existsSync(cacheFile)) {
      urls = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    } else {
      try {
        const html = await commonsParseHtml(wdName);
        urls = extractCiteNoteUrls(html);
        fs.writeFileSync(cacheFile, JSON.stringify(urls, null, 2));
      } catch (e) {
        console.log(`    parse FAIL ${wdName}: ${e.message}`);
        urls = [];
      }
      await sleep(COMMONS_DELAY_MS);
      scraped++;
      if (scraped % 25 === 0) {
        process.stdout.write(`[${folderName}] scraped ${scraped}/${misses.length}\n`);
      }
    }
    if (urls.length > 0) {
      provenance[key] = {
        wikidataId: null,
        wikidataUrl: null,
        collection: null,
        collectionWikidataId: null,
        location: null,
        inventory: null,
        describedAt: null,
        sourceLinks: urls.slice(0, 4).map((url) => ({ label: urlToLabel(url), url })),
      };
    }
  }

  // (Earlier passes also did a supplemental cite_note scrape for WD
  // hits with no describedAt URL, but Wikidata coverage already gives
  // those entries collection + inventory + Wikidata link — bonus
  // source URLs aren't worth the extra ~hour of API traffic.)

  return provenance;
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const folders = [];
  const opts = { limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") opts.limit = Number.parseInt(argv[++i], 10);
    else folders.push(a);
  }
  return { folders, opts };
}

const { folders, opts } = parseArgs(process.argv.slice(2));
if (!folders.length) {
  console.error("usage: node fetch-provenance.mjs <folder> [folder...] [--limit N]");
  process.exit(1);
}

const merged = {};
for (const f of folders) {
  const partial = await processFolder(f, opts);
  Object.assign(merged, partial);
}

const outPath = path.join(ROOT, "metadata", "provenance.json");
const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
const final = { ...existing, ...merged };
fs.writeFileSync(outPath, JSON.stringify(final, null, 2));
console.log(`\nWrote ${outPath} (${Object.keys(final).length} entries with provenance)`);
