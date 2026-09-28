#!/usr/bin/env node
// Fetch real provenance data for each Commons artwork.
//
// Usage:
//   node scripts/fetch-provenance.mjs <folder> [folder...]
//   node scripts/fetch-provenance.mjs collection-of-beauty audubon-birds
//   node scripts/fetch-provenance.mjs collection-of-beauty --limit 20
//   node scripts/fetch-provenance.mjs --reresolve
//
// Two phases:
//   A. Wikidata — for each Commons filename, look up the painting's
//      Wikidata item via wdt:P18, then read its P195 (collection), P217
//      (inventory number), P276 (location) and P973 (described-at URL)
//      statements with their qualifiers. A print's item lists every
//      impression in every museum, so the four fields are resolved to one
//      impression by scripts/lib/provenance-impression.mjs, using the
//      Commons file page as evidence when the item has several holdings.
//   B. Commons autonumber-link scrape — for files without a Wikidata hit,
//      fetch the file page HTML and pull URLs out of the rendered Source
//      field's `<a class="external autonumber">[N]</a>` markers. These
//      are the targets the orphan `[1]` refs in source.credit point to,
//      so we recover real provenance URLs even without Wikidata.
//
// --reresolve skips the P18 lookup and phase B. It corrects entries already
// in provenance.json that may mix impressions, from the wikidataId stored
// there: collection, location, inventory and describedAt are resolved again
// for items with several P195 or P217 values, and a location that doesn't
// fit its collection is replaced. Keys, wikidataId and sourceLinks are left
// alone, so hand-removed or hand-corrected items keep their stored QID.
//
// Polite to Wikimedia / WDQS:
//   - Descriptive User-Agent (contact + purpose)
//   - WDQS: 50-filename batches, ~750ms inter-batch delay, 60s timeout
//   - Commons parse: 600ms inter-request delay, single-threaded
//     (250ms triggers HTTP 429 after a few hundred calls)
//   - Per-batch caching under metadata/.cache/provenance/<folder>/, plus
//     statements.json and graph.json in metadata/.cache/provenance/ keyed
//     by QID. Delete those two to pick up Wikidata edits.
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

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyItem,
  extractPageEvidence,
  foldGraph,
  foldStatements,
  refitLocation,
  reresolveMode,
  resolveImpression,
} from "./lib/provenance-impression.mjs";
import { SOURCE_FOLDERS } from "./lib/source-folders.mjs";

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

// Labels in English, else the language-neutral "mul" label, which is where
// Wikidata now keeps names like "National Gallery of Art" (Q214867 has no
// "en" label left), else the collection's own language.
const LABEL_LANGUAGES = "en,mul,de,fr,nl,it,es";

// Commons filename -> Wikidata item, through the item's P18 image.
function buildP18Sparql(filenames) {
  const values = filenames.map((f) => `<${filePathUri(f)}>`).join("\n      ");
  return `SELECT ?image ?item WHERE {
  VALUES ?image {
      ${values}
  }
  ?item wdt:P18 ?image .
}`;
}

// Statement-level P195 / P217 / P276 / P973 with the qualifiers that tie
// them to one impression: P217 on a collection, P195 on a number or URL,
// P582 end time on a collection or location. wdt: would flatten all of
// that into unrelated values, which is how museums got mixed.
function buildStatementsSparql(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?item ?kind ?st ?rank ?value ?valueLabel ?end ?qinv ?qcoll WHERE {
  VALUES ?item { ${values} }
  {
    ?item p:P195 ?st . ?st ps:P195 ?value ; wikibase:rank ?rank . BIND("collection" AS ?kind)
    OPTIONAL { ?st pq:P582 ?end }
    OPTIONAL { ?st pq:P217 ?qinv }
  } UNION {
    ?item p:P217 ?st . ?st ps:P217 ?value ; wikibase:rank ?rank . BIND("inventory" AS ?kind)
    OPTIONAL { ?st pq:P195 ?qcoll }
  } UNION {
    ?item p:P276 ?st . ?st ps:P276 ?value ; wikibase:rank ?rank . BIND("location" AS ?kind)
    OPTIONAL { ?st pq:P582 ?end }
  } UNION {
    ?item p:P973 ?st . ?st ps:P973 ?value ; wikibase:rank ?rank . BIND("describedAt" AS ?kind)
    OPTIONAL { ?st pq:P195 ?qcoll }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGUAGES}". }
}`;
}

// Organisational and physical parents, websites and a population flag for
// the collections and locations the statements name. The resolver uses them
// to group a department with its museum, to accept a room or a city as a
// museum's location, and to match a P973 URL to a museum's website.
const GRAPH_EDGES = ["P361", "P749", "P127", "P195", "P276", "P159", "P131", "P17"];
// Parents worth fetching in turn. P131 and P17 only lead to territories,
// which the resolver needs to recognise but not to climb.
const GRAPH_CLIMB = new Set(["P361", "P749", "P127", "P195", "P276", "P159"]);
const GRAPH_DEPTH = 3;

function buildGraphSparql(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const props = GRAPH_EDGES.map((p) => `wdt:${p}`).join(" ");
  return `SELECT ?x ?xLabel ?p ?y ?web ?pop WHERE {
  VALUES ?x { ${values} }
  { VALUES ?p { ${props} } ?x ?p ?y . FILTER(isIRI(?y)) }
  UNION { ?x wdt:P856 ?web }
  UNION { ?x wdt:P1082 ?pop }
  UNION { ?x wikibase:sitelinks ?sitelinks }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGUAGES}". }
}`;
}

async function sparql(query) {
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
  return JSON.parse(res.body).results?.bindings ?? [];
}

const CACHE_ROOT = path.join(ROOT, "metadata", ".cache", "provenance");
const STATEMENTS_CACHE = path.join(CACHE_ROOT, "statements.json");
const GRAPH_CACHE = path.join(CACHE_ROOT, "graph.json");

const readJson = (file, fallback) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;

// qid -> folded statements, fetched for whatever the cache lacks.
async function loadStatements(qids) {
  const cache = readJson(STATEMENTS_CACHE, {});
  const missing = [...new Set(qids)].filter((q) => !cache[q]);
  for (let i = 0; i < missing.length; i += SPARQL_BATCH_SIZE) {
    const batch = missing.slice(i, i + SPARQL_BATCH_SIZE);
    process.stdout.write(`[statements] ${i + batch.length}/${missing.length}\n`);
    const folded = foldStatements(await sparql(buildStatementsSparql(batch)));
    for (const q of batch) cache[q] = folded.get(q) ?? emptyItem();
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    fs.writeFileSync(STATEMENTS_CACHE, JSON.stringify(cache));
    await sleep(SPARQL_DELAY_MS);
  }
  return cache;
}

// Graph nodes for `seeds` and their parents, GRAPH_DEPTH levels up.
async function loadGraph(seeds) {
  const graph = readJson(GRAPH_CACHE, {});
  let frontier = [...new Set(seeds)];
  for (let depth = 0; depth < GRAPH_DEPTH && frontier.length; depth++) {
    const missing = frontier.filter((q) => !graph[q]);
    for (let i = 0; i < missing.length; i += 150) {
      const batch = missing.slice(i, i + 150);
      process.stdout.write(`[graph] depth ${depth}: ${i + batch.length}/${missing.length}\n`);
      Object.assign(graph, foldGraph(await sparql(buildGraphSparql(batch)), batch));
      fs.mkdirSync(CACHE_ROOT, { recursive: true });
      fs.writeFileSync(GRAPH_CACHE, JSON.stringify(graph));
      await sleep(SPARQL_DELAY_MS);
    }
    const next = new Set();
    for (const q of frontier) {
      for (const [p, y] of graph[q]?.edges ?? []) if (GRAPH_CLIMB.has(p)) next.add(y);
    }
    frontier = [...next];
  }
  return graph;
}

const statementQids = (item) => [
  ...item.collections.map((c) => c.id),
  ...item.locations.map((l) => l.id),
  ...item.inventories.flatMap((i) => i.collections),
  ...item.describedAt.flatMap((d) => d.collections),
];

// Commons page evidence (institution + accession number), cached per file.
async function loadPageEvidence(folderName, wdName) {
  const dir = path.join(CACHE_ROOT, folderName);
  const file = path.join(dir, `page-${encodeURIComponent(wdName).slice(0, 200)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  let evidence = null;
  try {
    evidence = extractPageEvidence(await commonsParseHtml(wdName));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(evidence));
  } catch (e) {
    console.log(`    parse FAIL ${wdName}: ${e.message}`);
  }
  await sleep(COMMONS_DELAY_MS);
  return evidence;
}

// Resolve { key, wdName, folder, credit, qid, previous } records to
// provenance fields. `previous` is the stored record, used as a tie-breaker.
// Fetches statements, the institution graph and, for items with more than
// one holding, the Commons page of the file.
async function resolveRecords(records) {
  const statements = await loadStatements(records.map((r) => r.qid));
  let graph = await loadGraph(records.flatMap((r) => statementQids(statements[r.qid])));

  const resolved = new Map();
  const needPage = [];
  for (const r of records) {
    const evidence = { filename: r.key, credit: r.credit, previous: r.previous };
    const res = resolveImpression(statements[r.qid], graph, evidence);
    // Any item with more than one holding reads the page: it can overrule
    // a fallback, and it is the only source of an accession number.
    if (res.basis === "one-holding" || res.basis === "no-collection") resolved.set(r.key, res);
    else needPage.push(r);
  }
  if (needPage.length) {
    console.log(`[commons] reading ${needPage.length} file pages for items with several holdings`);
  }
  const pages = new Map();
  for (const r of needPage) {
    pages.set(r.key, await loadPageEvidence(r.folder, r.wdName));
  }
  graph = await loadGraph([...pages.values()].flatMap((p) => p?.institutions ?? []));
  for (const r of needPage) {
    const page = pages.get(r.key);
    const evidence = { filename: r.key, credit: r.credit, previous: r.previous, page };
    resolved.set(r.key, resolveImpression(statements[r.qid], graph, evidence));
  }

  const tally = {};
  for (const res of resolved.values()) tally[res.basis] = (tally[res.basis] ?? 0) + 1;
  console.log(`[resolve] ${JSON.stringify(tally)}`);
  return resolved;
}

const withoutBasis = ({ basis, ...fields }) => fields;

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
    filenames.push({ key: filename, wdName: bare, credit: entry.source?.credit ?? null });
  }
  if (opts.limit) filenames.splice(opts.limit);

  console.log(`[${folderName}] ${filenames.length} resolved entries`);

  const cacheDir = path.join(ROOT, "metadata", ".cache", "provenance", folderName);
  fs.mkdirSync(cacheDir, { recursive: true });

  // ── Phase A: Wikidata ───────────────────────────────────────────────
  const provenance = {};
  const records = [];
  for (let i = 0; i < filenames.length; i += SPARQL_BATCH_SIZE) {
    const batch = filenames.slice(i, i + SPARQL_BATCH_SIZE);
    const idx = String(i / SPARQL_BATCH_SIZE).padStart(4, "0");
    const cacheFile = path.join(cacheDir, `p18-${idx}.json`);
    let bindings;
    if (fs.existsSync(cacheFile)) {
      bindings = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      process.stdout.write(`[${folderName}] WD batch ${idx} (cached)\n`);
    } else {
      try {
        process.stdout.write(`[${folderName}] WD batch ${idx} fetching... `);
        bindings = await sparql(buildP18Sparql(batch.map((b) => b.wdName)));
        fs.writeFileSync(cacheFile, JSON.stringify(bindings, null, 2));
        process.stdout.write(`${bindings.length} bindings\n`);
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        bindings = [];
      }
      await sleep(SPARQL_DELAY_MS);
    }

    // First item wins when two items share an image, as before.
    const itemByImage = new Map();
    for (const b of bindings) {
      if (b.image?.value && b.item?.value && !itemByImage.has(b.image.value)) {
        itemByImage.set(b.image.value, b.item.value.replace(/^.*\/entity\//, ""));
      }
    }
    for (const { key, wdName, credit } of batch) {
      const qid = itemByImage.get(filePathUri(wdName));
      if (qid) {
        const previous = opts.existing[key] ?? null;
        records.push({ key, wdName, credit, qid, folder: folderName, previous });
      }
    }
  }

  const resolved = await resolveRecords(records);
  for (const { key, qid } of records) {
    provenance[key] = {
      wikidataId: qid,
      wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
      ...withoutBasis(resolved.get(key)),
      sourceLinks: [],
    };
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

// Correct existing entries from their stored QID. Only records that may mix
// impressions are touched (see reresolveMode): an item with several P195 or
// P217 values is resolved again in full, a stored location that doesn't fit
// the stored collection is replaced on its own. Keys keep their exact
// NFC/NFD form, and wikidataId and sourceLinks are never rewritten.
async function reresolveExisting(existing) {
  const sidecar = new Map();
  for (const folder of SOURCE_FOLDERS) {
    const file = path.join(ROOT, "metadata", `${folder}.json`);
    if (!fs.existsSync(file)) continue;
    const entries = JSON.parse(fs.readFileSync(file, "utf8")).entries ?? {};
    for (const [key, entry] of Object.entries(entries)) {
      const canonical = entry.source?.canonical_title;
      if (!canonical) continue;
      const rec = {
        folder,
        wdName: canonical.replace(/^File:/, ""),
        credit: entry.source?.credit ?? null,
      };
      sidecar.set(key, rec);
      if (!sidecar.has(key.normalize("NFC"))) sidecar.set(key.normalize("NFC"), rec);
    }
  }

  const withItem = Object.entries(existing).filter(([, prov]) => prov?.wikidataId);
  const statements = await loadStatements(withItem.map(([, prov]) => prov.wikidataId));
  const graph = await loadGraph(
    withItem.flatMap(([, prov]) => statementQids(statements[prov.wikidataId])),
  );

  const records = [];
  const locationOnly = new Map();
  for (const [key, prov] of withItem) {
    const item = statements[prov.wikidataId];
    const mode = reresolveMode(item, graph, prov);
    if (mode === "location") locationOnly.set(key, refitLocation(item, graph, prov));
    if (mode !== "full") continue;
    const side = sidecar.get(key) ?? sidecar.get(key.normalize("NFC"));
    records.push({
      key,
      previous: prov,
      qid: prov.wikidataId,
      // A key with no sidecar entry is resolved without its Commons page.
      folder: side?.folder ?? "unknown",
      wdName: side?.wdName ?? key,
      credit: side?.credit ?? null,
    });
  }
  console.log(
    `[reresolve] ${records.length} entries to resolve again, ${locationOnly.size} locations to refit`,
  );
  const resolved = await resolveRecords(records);

  const out = {};
  let changed = 0;
  for (const [key, prov] of Object.entries(existing)) {
    let next = prov;
    if (resolved.has(key)) next = { ...prov, ...withoutBasis(resolved.get(key)) };
    else if (locationOnly.has(key)) next = { ...prov, location: locationOnly.get(key) };
    if (JSON.stringify(next) !== JSON.stringify(prov)) changed++;
    out[key] = next;
  }
  console.log(`[reresolve] ${changed} entries changed`);
  return out;
}

function parseArgs(argv) {
  const folders = [];
  const opts = { limit: null, reresolve: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") opts.limit = Number.parseInt(argv[++i], 10);
    else if (a === "--reresolve") opts.reresolve = true;
    else folders.push(a);
  }
  return { folders, opts };
}

const { folders, opts } = parseArgs(process.argv.slice(2));
if (!folders.length && !opts.reresolve) {
  console.error(
    "usage: node fetch-provenance.mjs <folder> [folder...] [--limit N]\n" +
      "       node fetch-provenance.mjs --reresolve",
  );
  process.exit(1);
}

const outPath = path.join(ROOT, "metadata", "provenance.json");
const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};

let final;
if (opts.reresolve) {
  final = await reresolveExisting(existing);
} else {
  const merged = {};
  for (const f of folders) {
    const partial = await processFolder(f, { ...opts, existing });
    Object.assign(merged, partial);
  }
  final = { ...existing, ...merged };
}
fs.writeFileSync(outPath, `${JSON.stringify(final, null, 2)}\n`);
console.log(`\nWrote ${outPath} (${Object.keys(final).length} entries with provenance)`);
