#!/usr/bin/env node
// Tag artworks as NSFW so the gallery can hide/blur nudes by default.
//
// Usage:
//   node scripts/tag-nsfw.mjs                # all three folders
//   node scripts/tag-nsfw.mjs --no-network   # keyword-only (skip Wikidata)
//
// Output: metadata/nsfw-tags.json
//   { "<filename>": { source: "wikidata-depicts" | "keyword",
//                     reasons: ["Q43083", "title:nude", ...] }, ... }
//
// Two-layer taxonomy:
//
//   A. Wikidata depicts (P180) — authoritative.
//      For every artwork with a known wikidataId (read from
//      metadata/provenance.json), batch-query Wikidata for P180
//      values. If any value matches NSFW_QIDS, the artwork is
//      flagged.
//
//   B. Keyword fallback — title + description.
//      For artworks without a Wikidata hit (or for which the
//      Wikidata lookup didn't flag anything), scan title +
//      description against NSFW_KEYWORDS. Keyword matches are
//      noisier than depicts claims; the user can override per-image
//      in the UI.
//
// Heuristics worth knowing:
//   - We deliberately err toward false positives: if a description
//     mentions "naked" we flag it, even though some metaphorical
//     uses ("naked truth") will get caught. The UI lets users
//     reveal individual images.
//   - "Venus" / "Aphrodite" alone aren't flagged — too many
//     non-nude references (Venus de' Medici sculpture, Birth-of-
//     Venus titles for non-nude derivatives). They're flagged only
//     if combined with nude/naked/bath* in the same artwork.
//
// Polite to WDQS: 50 QIDs per batch, 750 ms inter-batch delay,
// per-batch caching under metadata/.cache/nsfw/.

import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const USER_AGENT =
  "CollectionOfBeautyNsfwTagger/1.0 (personal archive content tagging; contact: local user) Node";

const WDQS_URL = "https://query.wikidata.org/sparql";
const SPARQL_BATCH_SIZE = 50;
const SPARQL_DELAY_MS = 750;
const MAX_RETRIES = 5;

// QIDs treated as "this artwork depicts nudity" when seen in a
// painting's wdt:P180 (depicts) claim. Curated against
// Wikidata labels — verified by Special:EntityData lookup so we
// don't accidentally match an unrelated QID with a similar label.
const NSFW_QIDS = new Set([
  "Q40446", // nude (art genre — primary subject is the unclothed body)
  "Q10791", // nudity
  "Q622630", // odalisque
  "Q165853", // harem (women's quarters — common Orientalist subject)
  "Q327651", // bathing
  "Q98792658", // bather (person bathing)
]);

// Keyword regexes scanned against filename + title + description.
// Word boundaries so "nude" doesn't match "denude" or "nudibranch".
// Case-insensitive.
//
// Multilingual: titles + filenames in this archive frequently land
// in French/German/Italian/Dutch/Spanish even after the title-clean
// pass (filenames are never translated). The non-English cues below
// are common across the source folders. Keep them tight — we want
// "nu" only as a whole word ("Nu Couché") and not as the first two
// letters of "number".
const NSFW_KEYWORDS = [
  // English
  { pattern: /\bnude(s)?\b/i, label: "nude" },
  { pattern: /\bnudity\b/i, label: "nudity" },
  { pattern: /\bnaked\b/i, label: "naked" },
  { pattern: /\bunclothed\b/i, label: "unclothed" },
  { pattern: /\bundressed\b/i, label: "undressed" },
  { pattern: /\bdisrobed?\b/i, label: "disrobed" },
  { pattern: /\bbather(s)?\b/i, label: "bather" },
  { pattern: /\bbathing\b/i, label: "bathing" },
  { pattern: /\bodalisque(s)?\b/i, label: "odalisque" },
  { pattern: /\bharem\b/i, label: "harem" },
  { pattern: /\berotic\b/i, label: "erotic" },
  { pattern: /\bvoluptuous\b/i, label: "voluptuous" },
  // French — "Nu" / "Nue" / "Nus" / "Nues" (cap N to avoid "nu" as
  // article fragment in lowercase prose). "Baigneuse" / "Baigneurs"
  // = bather. Matches require leading word boundary; the title-case
  // requirement narrows false positives further.
  { pattern: /\bNu(e|s|es)?\b/, label: "fr:nu" },
  { pattern: /\bbaigneur(s|se|ses)?\b/i, label: "fr:baigneur" },
  // German — "Akt" only when title-cased (lowercase "akt" in
  // captions/descriptions is too noisy: "Akt" = act/file/dossier).
  // "Akt-Studie", "Liegender Akt", etc.
  { pattern: /\bAkt(e|en|studie)?\b/, label: "de:akt" },
  // Italian — "Nudo/Nuda/Nudi/Nude" capitalised.
  { pattern: /\bNud[oaie]\b/, label: "it:nudo" },
  // Spanish — "Desnudo/Desnuda" capitalised.
  { pattern: /\bDesnud[oa]s?\b/, label: "es:desnudo" },
  // Dutch — "Naakt".
  { pattern: /\bNaakt(e|en)?\b/, label: "nl:naakt" },
  // "Venus" / "Aphrodite" only when paired with a nudity cue in
  // the same string. Matched separately below.
];

// Anchor terms that, *combined* with one of NSFW_KEYWORDS' nudity
// cues anywhere in the same field, escalate the match. By
// themselves these names are too noisy (Birth-of-Venus reproductions
// without nudity, Aphrodite mythology references, etc).
const ANCHOR_GODDESS = /\b(venus|aphrodite)\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

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

function buildDepictsSparql(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?item ?depicts WHERE {
  VALUES ?item { ${values} }
  ?item wdt:P180 ?depicts .
}`;
}

async function sparqlBatch(qids) {
  const query = buildDepictsSparql(qids);
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

// ---------------------------------------------------------------------------

function loadProvenance() {
  const p = path.join(ROOT, "metadata", "provenance.json");
  if (!fs.existsSync(p)) return new Map();
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const m = new Map(); // filename -> qid
  for (const [fname, entry] of Object.entries(raw)) {
    if (entry?.wikidataId) m.set(fname, entry.wikidataId);
  }
  return m;
}

function loadFolderMeta(folder) {
  const p = path.join(ROOT, "metadata", `${folder}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------------

function keywordMatch(text) {
  if (!text) return [];
  const hits = [];
  for (const { pattern, label } of NSFW_KEYWORDS) {
    if (pattern.test(text)) hits.push(label);
  }
  // Goddess-name escalation: only a hit if combined with a nudity cue.
  if (ANCHOR_GODDESS.test(text) && hits.length > 0) {
    hits.push("venus/aphrodite-with-nudity-cue");
  }
  return hits;
}

async function phaseA(filenameToQid) {
  const cacheDir = path.join(ROOT, "metadata", ".cache", "nsfw");
  fs.mkdirSync(cacheDir, { recursive: true });

  const filenames = [...filenameToQid.keys()];
  const qidsToFiles = new Map(); // qid -> list of filenames using it
  for (const f of filenames) {
    const q = filenameToQid.get(f);
    if (!qidsToFiles.has(q)) qidsToFiles.set(q, []);
    qidsToFiles.get(q).push(f);
  }
  const uniqueQids = [...qidsToFiles.keys()];

  // qid -> Set of P180 QIDs
  const depictsByQid = new Map();
  for (let i = 0; i < uniqueQids.length; i += SPARQL_BATCH_SIZE) {
    const batch = uniqueQids.slice(i, i + SPARQL_BATCH_SIZE);
    const idx = String(i / SPARQL_BATCH_SIZE).padStart(4, "0");
    const cacheFile = path.join(cacheDir, `wd-${idx}.json`);
    let bindings;
    if (fs.existsSync(cacheFile)) {
      bindings = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      process.stdout.write(`[nsfw] WD batch ${idx} (cached, ${bindings.length} bindings)\n`);
    } else {
      try {
        process.stdout.write(`[nsfw] WD batch ${idx} fetching... `);
        const json = await sparqlBatch(batch);
        bindings = json.results?.bindings ?? [];
        fs.writeFileSync(cacheFile, JSON.stringify(bindings, null, 2));
        process.stdout.write(`${bindings.length} bindings\n`);
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        bindings = [];
      }
      await sleep(SPARQL_DELAY_MS);
    }

    for (const b of bindings) {
      const itemQid = (b.item?.value || "").replace(/^.*\/entity\//, "");
      const depQid = (b.depicts?.value || "").replace(/^.*\/entity\//, "");
      if (!itemQid || !depQid) continue;
      if (!depictsByQid.has(itemQid)) depictsByQid.set(itemQid, new Set());
      depictsByQid.get(itemQid).add(depQid);
    }
  }

  const tagged = new Map();
  for (const [qid, fnames] of qidsToFiles) {
    const depicts = depictsByQid.get(qid);
    if (!depicts) continue;
    const matchedQids = [...depicts].filter((d) => NSFW_QIDS.has(d));
    if (matchedQids.length === 0) continue;
    for (const fname of fnames) {
      tagged.set(fname, {
        source: "wikidata-depicts",
        reasons: matchedQids,
      });
    }
  }
  return tagged;
}

function phaseB(allEntries, alreadyTagged) {
  const tagged = new Map();
  for (const [fname, entry] of Object.entries(allEntries)) {
    if (alreadyTagged.has(fname)) continue;
    if (!entry || !entry.resolved) continue;
    // Filename underscores → spaces so "Femme_Nue_Etendue" matches
    // the \bNu(e)?\b pattern. Drop the extension so e.g. ".jpg"
    // never collides with anything.
    const filenameText = fname.replace(/\.[^.]+$/, "").replace(/_/g, " ");
    const fields = [
      ["filename", filenameText],
      ["title", entry.title],
      ["desc", entry.description],
    ];
    const reasons = [];
    for (const [scope, text] of fields) {
      if (!text) continue;
      const hits = keywordMatch(text);
      for (const h of hits) reasons.push(`${scope}:${h}`);
    }
    if (reasons.length > 0) {
      tagged.set(fname, { source: "keyword", reasons });
    }
  }
  return tagged;
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const noNetwork = args.includes("--no-network");

  const folders = ["collection-of-beauty", "audubon-birds", "kunstformen-images"];
  const allEntries = {};
  for (const f of folders) {
    const meta = loadFolderMeta(f);
    if (!meta) {
      console.warn(`[nsfw] missing metadata/${f}.json — skipping`);
      continue;
    }
    Object.assign(allEntries, meta.entries);
  }
  console.log(`[nsfw] ${Object.keys(allEntries).length} total entries across folders`);

  const filenameToQid = loadProvenance();
  console.log(`[nsfw] ${filenameToQid.size} entries with wikidataId in provenance.json`);

  let tagged = new Map();

  if (!noNetwork) {
    try {
      const wdTagged = await phaseA(filenameToQid);
      console.log(`[nsfw] phase A (Wikidata depicts): ${wdTagged.size} flagged`);
      for (const [k, v] of wdTagged) tagged.set(k, v);
    } catch (e) {
      console.warn(`[nsfw] phase A failed (${e.message}); falling back to keyword-only`);
    }
  } else {
    // TODO: re-run with network access to populate the Wikidata
    // depicts pass; --no-network leaves the catalog dependent on
    // keyword scanning alone, which misses depicts-only flags.
    console.log("[nsfw] --no-network: skipping Wikidata phase A");
  }

  const kwTagged = phaseB(allEntries, tagged);
  console.log(`[nsfw] phase B (keyword fallback): ${kwTagged.size} flagged`);
  for (const [k, v] of kwTagged) tagged.set(k, v);

  console.log(`[nsfw] total flagged: ${tagged.size} / ${Object.keys(allEntries).length}`);

  const out = {};
  // Sort keys for stable output diffs across reruns.
  for (const k of [...tagged.keys()].sort()) out[k] = tagged.get(k);

  const outPath = path.join(ROOT, "metadata", "nsfw-tags.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[nsfw] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
