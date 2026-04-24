#!/usr/bin/env node
// Enrich each artwork in src/data/artworks.json with real physical dimensions
// (width × height in cm) by consulting, in descending order of reliability:
//
//   1. Wikidata properties P2048 (height) / P2049 (width). The Wikidata item
//      is resolved via the Commons file's `{{Artwork|wikidata=Qxxxx}}` line,
//      or, failing that, via the Commons page's Structured Data (SDC)
//      property P6243 ("digital representation of") / P921 ("main subject").
//   2. The `|Dimensions=` / `|dimensions=` line of the Commons `{{Artwork}}`
//      template (formats: `{{size|cm|H|W}}`, `73 x 92 cm`, `H. 10 in. (25.7
//      cm); W. 15 in. (38.4 cm)`, etc.).
//   3. Known-collection static defaults (Audubon Birds of America plates
//      = 100.33 × 67.31 cm, Haeckel Kunstformen der Natur plates = 36 × 26 cm).
//
// Output: metadata/artwork-dimensions.json keyed by artwork id:
//   { "<id>": { widthCm, heightCm, source: "wikidata"|"wikimedia-template"|"static" } }
//
// The script is safe to re-run: existing entries are preserved unless --force
// is passed. Progress and final source-breakdown is logged.
//
// Usage:
//   node scripts/fetch-artwork-dimensions.mjs                    # all 2947
//   node scripts/fetch-artwork-dimensions.mjs --only=<id>[,<id>] # subset
//   node scripts/fetch-artwork-dimensions.mjs --force            # overwrite
//   node scripts/fetch-artwork-dimensions.mjs --limit=N          # first N

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const ARTWORKS_PATH = path.join(ROOT, "src", "data", "artworks.json");
const OUT_PATH = path.join(ROOT, "metadata", "artwork-dimensions.json");

const USER_AGENT = "collection-of-beauty-metadata-enrichment/1.0 (ricotrebeljahr@gmail.com)";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const BATCH_SIZE = 50; // MediaWiki API cap for non-bot users
const DELAY_MS = 220; // ~4.5 req/s, well under 5 req/s target
const MAX_RETRIES = 5;

// Length-unit Q-ids on Wikidata. Everything is converted to cm.
const UNIT_TO_CM = {
  "http://www.wikidata.org/entity/Q174728": 1.0, // centimetre
  "http://www.wikidata.org/entity/Q174789": 0.1, // millimetre
  "http://www.wikidata.org/entity/Q11573": 100.0, // metre
  "http://www.wikidata.org/entity/Q218593": 2.54, // inch
  "http://www.wikidata.org/entity/Q3710": 30.48, // foot
};

// Per-collection static defaults (see Deliverable §3). Used only when neither
// Wikidata nor wikitext parsing yielded anything.
const STATIC_DEFAULTS = {
  "audubon-birds": {
    // "Birds of America" double-elephant folio = 39 1/2 × 26 1/2 in.
    widthCm: round(26.5 * 2.54, 2),
    heightCm: round(39.5 * 2.54, 2),
  },
  "kunstformen-images": {
    // Haeckel's Kunstformen der Natur plates are ~36 × 26 cm.
    widthCm: 26,
    heightCm: 36,
  },
};

// ---------------------------------------------------------------------------
// arg parsing

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (!m) continue;
  args.set(m[1], m[2] ?? "true");
}
const FORCE = args.get("force") === "true";
const ONLY = args.has("only")
  ? new Set(
      args
        .get("only")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;
const LIMIT = args.has("limit") ? Number.parseInt(args.get("limit"), 10) : null;

// ---------------------------------------------------------------------------
// tiny helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function plausibleCm(n) {
  // Paintings and prints: 1 cm up to 10 m. Anything outside that is parsed
  // garbage or a unit mix-up we shouldn't trust.
  return Number.isFinite(n) && n >= 1 && n <= 1000;
}

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
        const retryAfter = Number.parseInt(res.headers["retry-after"] || "0", 10);
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", async () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(body);
              if (parsed.error && parsed.error.code === "maxlag") {
                if (retry >= MAX_RETRIES) return reject(new Error("maxlag: retries exhausted"));
                const wait = Math.max((retryAfter || 5) * 1000, 2000);
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
            await sleep(wait);
            return httpsGetJson(url, retry + 1).then(resolve, reject);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error("request timeout")));
  });
}

// Canonicalize an `objectKey` like "collection-of-beauty/Foo_Bar.jpg" to a
// MediaWiki title ("File:Foo_Bar.jpg"). Spaces become underscores. The title
// is NFC-normalized because MediaWiki canonicalizes every title to NFC
// internally — sending NFD (e.g. combining diacritics `é` = e+U+0301) works,
// but the echoed `normalized.from` in the response will be NFC, so lookups
// keyed on the raw input string would silently miss.
function objectKeyToFileTitle(objectKey) {
  const filename = objectKey.split("/").slice(1).join("/");
  return ("File:" + filename.replace(/ /g, "_")).normalize("NFC");
}

// ---------------------------------------------------------------------------
// wikitext parsing

// A single named-parameter extractor tolerant of the wild whitespace variations
// observed on Commons (e.g. `|wikidata = Qx`, `|wikidata=Qx`,
// `|wikidata تحديث = Qx`). Returns the raw trimmed value after `=`, up to the
// next `|` or template boundary on the same logical line.
function extractTemplateField(wikitext, fieldNames) {
  for (const name of fieldNames) {
    // `[ \t]` (not `\s`) around the `=` so an empty value doesn't silently
    // cross into the next line (the next `|field=` pattern).
    const re = new RegExp(`\\|[ \\t]*${name}\\b[^=\\n]*=[ \\t]*([^\\n|}]*)`, "i");
    const m = wikitext.match(re);
    if (m) {
      const val = m[1].trim();
      if (val) return val;
    }
  }
  return null;
}

function extractWikidataQid(wikitext) {
  const raw = extractTemplateField(wikitext, ["wikidata"]);
  if (!raw) return null;
  const m = raw.match(/\bQ(\d+)\b/);
  return m ? "Q" + m[1] : null;
}

function extractRawDimensions(wikitext) {
  // Grab the line after `|dimensions = ` (or a near-synonym), without stopping
  // at `|`/`}}` — the value routinely contains wiki templates with pipes such
  // as {{size|cm|...}} or {{With frame}}.
  //
  // `pretty_dimensions` is a Google Art Project boilerplate field (format:
  // `w71 x h59 cm`); it's valuable because the Commons `dimensions` field is
  // often empty on GAP imports while `pretty_dimensions` is always filled.
  //
  // Using `[ \t]*` (not `\s*`) for the pre/post-`=` whitespace so an empty
  // value terminates cleanly at the newline rather than silently consuming
  // the next field.
  for (const name of ["dimensions", "commons_dimensions", "pretty_dimensions"]) {
    const re = new RegExp(`\\|[ \\t]*${name}[ \\t]*=[ \\t]*([^\\n]*)`, "i");
    const m = wikitext.match(re);
    if (m) {
      const val = m[1].trim();
      if (val) return val;
    }
  }
  return null;
}

// Parse a free-form dimension string found on a Commons `|dimensions=` line.
// Returns { widthCm, heightCm } or null. Height is listed first in `{{size}}`.
function parseDimensionString(raw) {
  if (!raw) return null;
  // 1. {{size|UNIT|HEIGHT|WIDTH}} or {{size|unit=UNIT|HEIGHT|WIDTH}}
  //    Some pages have multiple {{size}} templates (e.g. with/without frame);
  //    use the first one which is typically the unframed work.
  const sizeRe = /\{\{\s*(?:size|Size|SIZE)\s*\|([^{}]+?)\}\}/;
  const sm = raw.match(sizeRe);
  if (sm) {
    const parts = sm[1]
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    let unit = null;
    const nums = [];
    for (const p of parts) {
      const eq = p.match(/^([^=]+)=(.*)$/);
      if (eq) {
        const key = eq[1].trim().toLowerCase();
        const val = eq[2].trim();
        if (key === "unit") unit = val.toLowerCase();
        else if (!Number.isNaN(Number.parseFloat(val)) && /^[\d.]+$/.test(val))
          nums.push(Number.parseFloat(val));
      } else if (/^[a-zA-Z]+$/.test(p) && unit == null) {
        unit = p.toLowerCase();
      } else if (!Number.isNaN(Number.parseFloat(p))) {
        nums.push(Number.parseFloat(p));
      }
    }
    if (nums.length >= 2 && unit) {
      const factor = unitToCmFactor(unit);
      if (factor) {
        // {{size|unit|HEIGHT|WIDTH}} (Commons convention, height first)
        const heightCm = round(nums[0] * factor, 2);
        const widthCm = round(nums[1] * factor, 2);
        if (plausibleCm(widthCm) && plausibleCm(heightCm)) return { widthCm, heightCm };
      }
    }
  }

  // 2. Labelled height/width: `H. 10 1/8 in. (25.7 cm); W. 15 1/8 in. (38.4 cm)`
  //    or `Height: 92 cm; Width: 73 cm`.
  const hMatch = raw.match(
    /(?:H(?:\.|eight)?|height)[^\dA-Za-z]{0,8}(?:[\d.\s/]+(?:in|cm|mm|m)\.?\s*\()?\s*([\d.]+)\s*(cm|mm|m|in|inches?)\b/i,
  );
  const wMatch = raw.match(
    /(?:W(?:\.|idth)?|width)[^\dA-Za-z]{0,8}(?:[\d.\s/]+(?:in|cm|mm|m)\.?\s*\()?\s*([\d.]+)\s*(cm|mm|m|in|inches?)\b/i,
  );
  if (hMatch && wMatch) {
    const h = convertToCm(Number.parseFloat(hMatch[1]), hMatch[2]);
    const w = convertToCm(Number.parseFloat(wMatch[1]), wMatch[2]);
    if (h != null && w != null && plausibleCm(h) && plausibleCm(w))
      return { widthCm: round(w, 2), heightCm: round(h, 2) };
  }

  // 3. Plain `H × W unit` or `H x W unit` (ambiguous which is first — on
  //    Commons the convention is still height first for paintings). Reject
  //    3-dimensional strings like `32 x 46 x 2 cm` (W × H × D for boxes /
  //    sculptures) since we can't reliably pick the right two.
  const threeDRe =
    /(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m|in|inches?)\b/i;
  if (threeDRe.test(raw)) return null;

  // Google Art Project uses `wWIDTH x hHEIGHT UNIT`. Check this first so we
  // preserve axis identity — otherwise we'd fall through to the generic pair
  // parser (which assumes height-first).
  //
  // GAP's `|pretty_dimensions = w997 x h610 cm` is a known-buggy import from
  // Commons: the numbers are actually millimetres but get labelled `cm`. If
  // the stated unit gives implausibly huge cm values (≥ 400 cm) and
  // interpreting as mm lands in a realistic painting range (1–300 cm on
  // both dims), trust the mm reading.
  const gapRe =
    /w\s*(\d+(?:[.,]\d+)?)\s*(?:[x×X]|by)\s*h\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m|in|inches?)\b/i;
  const gm = raw.match(gapRe);
  if (gm) {
    const w = Number.parseFloat(gm[1].replace(",", "."));
    const h = Number.parseFloat(gm[2].replace(",", "."));
    const unit = gm[3];
    let wCm = convertToCm(w, unit);
    let hCm = convertToCm(h, unit);
    if (/^cm$/i.test(unit) && wCm != null && hCm != null && (wCm >= 400 || hCm >= 400)) {
      const wMm = wCm / 10;
      const hMm = hCm / 10;
      if (wMm >= 1 && hMm >= 1 && wMm <= 300 && hMm <= 300) {
        wCm = wMm;
        hCm = hMm;
      }
    }
    if (wCm != null && hCm != null && plausibleCm(wCm) && plausibleCm(hCm))
      return { widthCm: round(wCm, 2), heightCm: round(hCm, 2) };
  }
  const pairRe = /(\d+(?:[.,]\d+)?)\s*(?:[x×X]|by)\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m|in|inches?)\b/i;
  const pm = raw.match(pairRe);
  if (pm) {
    const a = Number.parseFloat(pm[1].replace(",", "."));
    const b = Number.parseFloat(pm[2].replace(",", "."));
    const unit = pm[3];
    const aCm = convertToCm(a, unit);
    const bCm = convertToCm(b, unit);
    if (aCm != null && bCm != null && plausibleCm(aCm) && plausibleCm(bCm))
      return { widthCm: round(bCm, 2), heightCm: round(aCm, 2) };
  }

  return null;
}

function unitToCmFactor(u) {
  if (!u) return null;
  const k = u.toLowerCase().replace(/\./g, "");
  if (k === "cm" || k === "centimetre" || k === "centimeter") return 1;
  if (k === "mm" || k === "millimetre" || k === "millimeter") return 0.1;
  if (k === "m" || k === "metre" || k === "meter") return 100;
  if (k === "in" || k === "inch" || k === "inches") return 2.54;
  if (k === "ft" || k === "foot" || k === "feet") return 30.48;
  return null;
}

function convertToCm(value, unit) {
  const f = unitToCmFactor(unit);
  if (f == null || !Number.isFinite(value)) return null;
  return value * f;
}

// ---------------------------------------------------------------------------
// batch fetchers

async function fetchWikitextBatch(titles) {
  // Returns Map<title, { wikitext, pageid } | null>. Titles must be full
  // `File:Xxx.jpg`. pageid is needed to construct the structured-data M-id
  // for a later SDC fallback pass.
  if (!titles.length) return new Map();
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "revisions|info",
    rvprop: "content",
    rvslots: "main",
    maxlag: "5",
    titles: titles.join("|"),
  });
  const url = `${COMMONS_API}?${params.toString()}`;
  const payload = await httpsGetJson(url);
  // MediaWiki may add multiple layers of normalization (e.g. an NFD->NFC
  // step then an underscore->space step). Chase the chain so a raw input
  // title maps all the way to the final canonical "File:X Y.jpg".
  const step = new Map();
  for (const n of payload?.query?.normalized || []) step.set(n.from, n.to);
  function resolveCanonical(t) {
    let cur = t;
    for (let i = 0; i < 8; i++) {
      const next = step.get(cur);
      if (!next || next === cur) return cur;
      cur = next;
    }
    return cur;
  }
  const byTitle = new Map();
  for (const p of payload?.query?.pages || []) byTitle.set(p.title, p);
  const out = new Map();
  for (const t of titles) {
    const canonical = resolveCanonical(t);
    const page = byTitle.get(canonical);
    if (!page || page.missing) {
      out.set(t, null);
      continue;
    }
    const content = page.revisions?.[0]?.slots?.main?.content ?? null;
    const pageid = page.pageid ?? null;
    if (!content && !pageid) {
      out.set(t, null);
    } else {
      out.set(t, { wikitext: content, pageid });
    }
  }
  return out;
}

async function fetchSdcBatch(mids) {
  // Returns Map<mid, { p6243?, p921? }> — Q-ids from Structured Data on
  // Commons, keyed by M-id. Used as a fallback when wikitext didn't yield a
  // Q-id. We key on M-id (constructed from pageid) because `wbgetentities`
  // on commonswiki does not echo the source title back per entity.
  if (!mids.length) return new Map();
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: mids.join("|"),
    props: "claims",
    maxlag: "5",
  });
  const url = `${COMMONS_API}?${params.toString()}`;
  const payload = await httpsGetJson(url);
  const out = new Map();
  const entities = payload?.entities || {};
  for (const mid of mids) {
    const e = entities[mid];
    if (!e || e.missing != null) {
      out.set(mid, null);
      continue;
    }
    const statements = e.statements || e.claims || {};
    const pick = (p) => {
      const arr = statements[p];
      if (!arr?.length) return null;
      const v = arr[0]?.mainsnak?.datavalue?.value;
      return v?.id || null;
    };
    out.set(mid, { p6243: pick("P6243"), p921: pick("P921") });
  }
  return out;
}

async function fetchWikidataBatch(qids) {
  // Returns Map<Qid, { heightCm, widthCm } | null>. Non-cm units are converted
  // via UNIT_TO_CM.
  if (!qids.length) return new Map();
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: qids.join("|"),
    props: "claims",
    maxlag: "5",
  });
  const url = `${WIKIDATA_API}?${params.toString()}`;
  const payload = await httpsGetJson(url);
  const out = new Map();
  const entities = payload?.entities || {};
  for (const qid of qids) {
    const e = entities[qid];
    if (!e || e.missing != null) {
      out.set(qid, null);
      continue;
    }
    const claims = e.claims || {};
    const readQuantity = (p) => {
      const arr = claims[p];
      if (!arr?.length) return null;
      const v = arr[0]?.mainsnak?.datavalue?.value;
      if (!v) return null;
      const amount = Number.parseFloat(v.amount);
      const factor = UNIT_TO_CM[v.unit];
      if (!Number.isFinite(amount) || factor == null) return null;
      return amount * factor;
    };
    const heightCm = readQuantity("P2048");
    const widthCm = readQuantity("P2049");
    if (heightCm != null && widthCm != null && plausibleCm(heightCm) && plausibleCm(widthCm)) {
      out.set(qid, { heightCm: round(heightCm, 2), widthCm: round(widthCm, 2) });
    } else {
      out.set(qid, null);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// main pipeline

async function main() {
  const artworks = JSON.parse(fs.readFileSync(ARTWORKS_PATH, "utf8"));
  const existing = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) : {};

  let candidates = artworks;
  if (ONLY) candidates = candidates.filter((a) => ONLY.has(a.id));
  if (LIMIT) candidates = candidates.slice(0, LIMIT);

  const todo = FORCE
    ? candidates
    : candidates.filter((a) => !Object.prototype.hasOwnProperty.call(existing, a.id));

  console.log(
    `[dims] ${artworks.length} artworks total; ${candidates.length} in scope; ${todo.length} to fetch (force=${FORCE})`,
  );

  const stats = {
    wikidata: 0,
    "wikimedia-template": 0,
    static: 0,
    null: 0,
    skipped_existing: candidates.length - todo.length,
  };

  // Bucket by folder — only Wikimedia folders go through the API.
  const byFolder = new Map();
  for (const a of todo) {
    if (!byFolder.has(a.folder)) byFolder.set(a.folder, []);
    byFolder.get(a.folder).push(a);
  }

  const results = { ...existing };

  // --- Apply static defaults for non-wikimedia-lookup folders up front. The
  // audubon-birds / kunstformen-images metadata entries *also* have Commons
  // pages, but their wikitext rarely carries dimensions — the per-collection
  // default is both more accurate (uniform plate size) and cheaper.
  for (const [folder, entries] of byFolder) {
    const def = STATIC_DEFAULTS[folder];
    if (!def) continue;
    for (const a of entries) {
      results[a.id] = { ...def, source: "static" };
      stats.static++;
    }
  }

  // --- Remaining folders: batch Commons wikitext fetches.
  const wikimediaTodo = todo.filter((a) => !STATIC_DEFAULTS[a.folder] && a.commonsUrl);

  // title -> artwork map
  const titleToArtwork = new Map();
  for (const a of wikimediaTodo) {
    const t = objectKeyToFileTitle(a.objectKey);
    if (!titleToArtwork.has(t)) titleToArtwork.set(t, []);
    titleToArtwork.get(t).push(a);
  }

  const allTitles = [...titleToArtwork.keys()];
  console.log(`[dims] fetching wikitext for ${allTitles.length} Commons files`);

  const wikidataQidByArtworkId = new Map();
  const templateDimsByArtworkId = new Map();
  // title -> { pageid } for titles that lacked a Q-id in their wikitext.
  const sdcFallbackByTitle = new Map();

  for (let i = 0; i < allTitles.length; i += BATCH_SIZE) {
    const batch = allTitles.slice(i, i + BATCH_SIZE);
    process.stdout.write(`[dims] wikitext ${i + batch.length}/${allTitles.length}... `);
    let wikitextByTitle;
    try {
      wikitextByTitle = await fetchWikitextBatch(batch);
      process.stdout.write("ok\n");
    } catch (e) {
      process.stdout.write(`FAILED: ${e.message}\n`);
      wikitextByTitle = new Map(batch.map((t) => [t, null]));
    }
    for (const [t, info] of wikitextByTitle) {
      const arts = titleToArtwork.get(t) || [];
      if (!info) continue; // truly missing page: nothing we can do
      const { wikitext, pageid } = info;
      const qid = wikitext ? extractWikidataQid(wikitext) : null;
      const rawDims = wikitext ? extractRawDimensions(wikitext) : null;
      const parsedDims = rawDims ? parseDimensionString(rawDims) : null;
      for (const a of arts) {
        if (qid) wikidataQidByArtworkId.set(a.id, qid);
        if (parsedDims) templateDimsByArtworkId.set(a.id, parsedDims);
      }
      if (!qid && pageid != null) {
        sdcFallbackByTitle.set(t, { pageid });
      }
    }
    await sleep(DELAY_MS);
  }

  // --- SDC fallback for titles that didn't carry a |wikidata= field.
  if (sdcFallbackByTitle.size) {
    const entries = [...sdcFallbackByTitle.entries()];
    console.log(`[dims] SDC fallback for ${entries.length} files missing wikidata= field`);
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const slice = entries.slice(i, i + BATCH_SIZE);
      const mids = slice.map(([, v]) => `M${v.pageid}`);
      process.stdout.write(`[dims] SDC ${i + slice.length}/${entries.length}... `);
      let sdcByMid;
      try {
        sdcByMid = await fetchSdcBatch(mids);
        process.stdout.write("ok\n");
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        sdcByMid = new Map(mids.map((m) => [m, null]));
      }
      for (let k = 0; k < slice.length; k++) {
        const [t] = slice[k];
        const mid = mids[k];
        const sdc = sdcByMid.get(mid);
        if (!sdc) continue;
        const qid = sdc.p6243 || sdc.p921;
        if (!qid) continue;
        for (const a of titleToArtwork.get(t) || []) {
          if (!wikidataQidByArtworkId.has(a.id)) wikidataQidByArtworkId.set(a.id, qid);
        }
      }
      await sleep(DELAY_MS);
    }
  }

  // --- Resolve Q-ids at Wikidata in batches.
  const uniqueQids = [...new Set(wikidataQidByArtworkId.values())];
  console.log(`[dims] resolving ${uniqueQids.length} unique Wikidata items`);
  const dimsByQid = new Map();
  for (let i = 0; i < uniqueQids.length; i += BATCH_SIZE) {
    const batch = uniqueQids.slice(i, i + BATCH_SIZE);
    process.stdout.write(`[dims] wikidata ${i + batch.length}/${uniqueQids.length}... `);
    let m;
    try {
      m = await fetchWikidataBatch(batch);
      process.stdout.write("ok\n");
    } catch (e) {
      process.stdout.write(`FAILED: ${e.message}\n`);
      m = new Map(batch.map((q) => [q, null]));
    }
    for (const [q, v] of m) dimsByQid.set(q, v);
    await sleep(DELAY_MS);
  }

  // --- Compose final results per artwork, preferring Wikidata > template.
  // Cross-validation: some Wikidata painting items (notably Google Art Project
  // imports) mis-tag centimetre values as millimetres, yielding a tenfold
  // under-reporting. If the Commons `{{Artwork|dimensions=...}}` template
  // parses to something that disagrees with Wikidata by more than 2× on
  // either axis, trust the template — it is almost always the museum-sourced
  // figure. (Small etchings where both sources agree pass through untouched.)
  for (const a of wikimediaTodo) {
    const qid = wikidataQidByArtworkId.get(a.id);
    const wd = qid ? dimsByQid.get(qid) : null;
    const tmpl = templateDimsByArtworkId.get(a.id);
    const disagree =
      wd &&
      tmpl &&
      (Math.max(wd.widthCm, tmpl.widthCm) / Math.max(Math.min(wd.widthCm, tmpl.widthCm), 0.01) >
        2 ||
        Math.max(wd.heightCm, tmpl.heightCm) /
          Math.max(Math.min(wd.heightCm, tmpl.heightCm), 0.01) >
          2);
    if (wd && !disagree) {
      results[a.id] = {
        widthCm: wd.widthCm,
        heightCm: wd.heightCm,
        source: "wikidata",
      };
      stats.wikidata++;
      continue;
    }
    if (tmpl) {
      results[a.id] = {
        widthCm: tmpl.widthCm,
        heightCm: tmpl.heightCm,
        source: "wikimedia-template",
      };
      stats["wikimedia-template"]++;
      continue;
    }
    if (wd) {
      // Wikidata present but we discarded it as disagreeing without a template
      // to corroborate — fall back to trusting Wikidata rather than null.
      results[a.id] = {
        widthCm: wd.widthCm,
        heightCm: wd.heightCm,
        source: "wikidata",
      };
      stats.wikidata++;
      continue;
    }
    results[a.id] = null;
    stats.null++;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2) + "\n");

  console.log("");
  console.log("[dims] done. sidecar:", path.relative(ROOT, OUT_PATH));
  console.log("[dims] source breakdown for this run:");
  console.log("  wikidata          :", stats.wikidata);
  console.log("  wikimedia-template:", stats["wikimedia-template"]);
  console.log("  static            :", stats.static);
  console.log("  unresolved (null) :", stats.null);
  console.log("  skipped (existing):", stats.skipped_existing);
  const totalResolved = Object.values(results).filter((v) => v != null).length;
  console.log(
    `[dims] total entries with dimensions in sidecar: ${totalResolved}/${artworks.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
