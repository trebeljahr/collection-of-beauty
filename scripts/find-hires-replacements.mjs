#!/usr/bin/env node
/**
 * Find higher-resolution Commons replacements for low-res catalogue works.
 *
 * Target set: works under MIN_MEGAPIXELS or with a side shorter than
 * MIN_EDGE px. For each target, three discovery strategies:
 *
 *   0. own-file   — the Commons file we already point at has more pixels
 *                   than our local copy (we downloaded a thumbnail or the
 *                   file was re-uploaded at higher res). Re-download wins.
 *   1. wikidata   — the work's Wikidata item P18 image, when it differs
 *                   from the file we have.
 *   2. search     — Commons fulltext search (namespace 6) on title+artist.
 *
 * Candidates are filtered (aspect ratio within tolerance, >= MIN_GAIN x
 * pixels) and then verified perceptually: dHash of the candidate's 256px
 * thumb vs dHash of our local smallest variant. Low hamming distance =
 * same artwork, different digitization.
 *
 * Output: src/data/replacement-candidates.json (consumed by the
 * /replace-low-res review page) — same shape as the previous workflow
 * run, with extra fields { hamming, source } per candidate. Prior
 * agent-found candidates are merged in and re-verified.
 *
 * Usage: node scripts/find-hires-replacements.mjs [--limit=N]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTWORKS_PATH = path.join(ROOT, "src/data/artworks.json");
const PRIOR_PATH = path.join(ROOT, "src/data/replacement-candidates.json");
const OUT_PATH = path.join(ROOT, "src/data/replacement-candidates.json");
const ASSETS_WEB = path.join(ROOT, "assets-web");
const ASSETS_RAW = path.join(ROOT, "assets");

const MIN_MEGAPIXELS = 0.5;
const MIN_EDGE = 600;
const MIN_GAIN = 1.8; // candidate must have >= this x pixel count
const ASPECT_TOL = 0.08; // 8% relative aspect-ratio drift allowed
const REQUEST_GAP_MS = 250;
const UA = "CollectionOfBeautyBot/1.0 (personal art catalogue; contact via commons talk)";

const API = "https://commons.wikimedia.org/w/api.php";
const WDAPI = "https://www.wikidata.org/w/api.php";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

let lastRequest = 0;
async function politeFetch(url, asJson = true) {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      return asJson ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

function apiUrl(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", maxlag: 5, ...params })) {
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// ---- dHash (same params as find-duplicate-images.mjs) ----
const HASH_W = 9;
const HASH_H = 8;

async function dHashBuffer(input) {
  const raw = await sharp(input).resize(HASH_W, HASH_H, { fit: "fill" }).greyscale().raw().toBuffer();
  const bits = new Uint8Array(8);
  let bitIdx = 0;
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      if (raw[y * HASH_W + x] < raw[y * HASH_W + x + 1]) bits[bitIdx >> 3] |= 1 << (bitIdx & 7);
      bitIdx++;
    }
  }
  return Buffer.from(bits).toString("hex");
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = Number.parseInt(a.slice(i, i + 2), 16) ^ Number.parseInt(b.slice(i, i + 2), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function localVariantPath(objectKey, variantWidths) {
  const ext = path.extname(objectKey);
  const dir = path.join(ASSETS_WEB, path.dirname(objectKey), path.basename(objectKey, ext));
  if (Array.isArray(variantWidths) && variantWidths.length) {
    const smallest = Math.min(...variantWidths);
    for (const e of ["avif", "webp"]) {
      const p = path.join(dir, `${smallest}.${e}`);
      if (await exists(p)) return p;
    }
  }
  const raw = path.join(ASSETS_RAW, objectKey);
  return (await exists(raw)) ? raw : null;
}

function commonsFilenameFromObjectKey(objectKey) {
  return path.basename(objectKey);
}

function filenameFromUploadUrl(fileUrl) {
  try {
    const parts = new URL(fileUrl).pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return null;
  }
}

function aspectOk(cw, ch, tw, th) {
  const a = cw / ch;
  const b = tw / th;
  return Math.abs(Math.log(a / b)) <= ASPECT_TOL;
}

// Batched imageinfo lookup: title -> { width, height, url, descUrl, mime, thumbUrl }
async function imageInfoBatch(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const slice = titles.slice(i, i + 40);
    const data = await politeFetch(
      apiUrl({
        action: "query",
        titles: slice.map((t) => (t.startsWith("File:") ? t : `File:${t}`)).join("|"),
        prop: "imageinfo",
        iiprop: "size|url|mime",
        iiurlwidth: 256,
        redirects: 1,
      }),
    );
    const pages = data?.query?.pages ?? {};
    const normalized = new Map();
    for (const n of data?.query?.normalized ?? []) normalized.set(n.to, n.from);
    for (const r of data?.query?.redirects ?? []) {
      // map redirect target back to the original query title (possibly via normalization)
      normalized.set(r.to, normalized.get(r.from) ?? r.from);
    }
    for (const page of Object.values(pages)) {
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      const queryTitle = normalized.get(page.title) ?? page.title;
      const rec = {
        canonicalTitle: page.title,
        width: ii.width,
        height: ii.height,
        url: ii.url,
        descUrl: ii.descriptionurl,
        mime: ii.mime,
        thumbUrl: ii.thumburl ?? null,
      };
      out.set(queryTitle, rec);
      out.set(page.title, rec);
    }
  }
  return out;
}

async function wikidataP18(qid) {
  const data = await politeFetch(
    `${WDAPI}?action=wbgetclaims&entity=${encodeURIComponent(qid)}&property=P18&format=json`,
  );
  const claims = data?.claims?.P18 ?? [];
  return claims
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v) => typeof v === "string");
}

async function commonsSearch(query) {
  const data = await politeFetch(
    apiUrl({
      action: "query",
      list: "search",
      srsearch: query,
      srnamespace: 6,
      srlimit: 12,
    }),
  );
  return (data?.query?.search ?? []).map((r) => r.title);
}

function cleanTitleForSearch(t) {
  return String(t ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["“”«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function confidenceFor(hammingDist, source) {
  let conf;
  if (hammingDist == null) conf = 0.4;
  else if (hammingDist <= 4) conf = 0.95;
  else if (hammingDist <= 8) conf = 0.85;
  else if (hammingDist <= 12) conf = 0.55;
  else conf = 0.25;
  if (source === "wikidata-p18") conf = Math.max(conf, 0.7);
  if (source === "own-file") conf = 1.0;
  return conf;
}

async function main() {
  const artworks = JSON.parse(await fs.readFile(ARTWORKS_PATH, "utf8"));
  let prior = [];
  try {
    prior = JSON.parse(await fs.readFile(PRIOR_PATH, "utf8"));
  } catch {
    /* first run */
  }
  const priorByTarget = new Map(prior.map((e) => [e.target.id, e]));

  const targets = artworks
    .filter((w) => {
      const mp = (w.width * w.height) / 1e6;
      return mp < MIN_MEGAPIXELS || (Math.min(w.width, w.height) < MIN_EDGE && mp < 1.5);
    })
    .slice(0, LIMIT);

  process.stderr.write(`Targets: ${targets.length}\n`);

  // ---- Stage 0: own-file imageinfo for every target (batched) ----
  const ownTitles = targets.map((t) => commonsFilenameFromObjectKey(t.objectKey).replace(/_/g, " "));
  const ownInfo = await imageInfoBatch(ownTitles);

  const results = [];
  let idx = 0;
  for (const t of targets) {
    idx++;
    const localPixels = t.width * t.height;
    const ownTitle = commonsFilenameFromObjectKey(t.objectKey).replace(/_/g, " ");
    const own = ownInfo.get(ownTitle) ?? ownInfo.get(`File:${ownTitle}`);

    const localPath = await localVariantPath(t.objectKey, t.variantWidths);
    let localHash = null;
    if (localPath) {
      try {
        localHash = await dHashBuffer(localPath);
      } catch {
        /* unhashable */
      }
    }

    const candidates = new Map(); // canonicalTitle -> candidate record

    // Stage 0: same file, more pixels on Commons
    if (own && own.width * own.height >= localPixels * 1.2) {
      candidates.set(own.canonicalTitle, {
        fileUrl: own.url,
        commonsPageUrl: own.descUrl,
        width: own.width,
        height: own.height,
        source: "own-file",
        thumbUrl: own.thumbUrl,
        reason: `Commons copy of the same file is ${own.width}x${own.height} vs local ${t.width}x${t.height} — local copy is a downscale; re-download.`,
      });
    }

    // Stage 1: Wikidata P18
    const qid = t.provenance?.wikidataId ?? null;
    let p18Files = [];
    if (qid) {
      p18Files = await wikidataP18(qid);
    }

    // Stage 2: Commons search
    const artist = t.artist ?? "";
    const searchQueries = [];
    const title = cleanTitleForSearch(t.title);
    const etitle = cleanTitleForSearch(t.englishTitle);
    if (title) searchQueries.push(`${title} ${artist}`.trim());
    if (etitle && etitle.toLowerCase() !== title.toLowerCase()) {
      searchQueries.push(`${etitle} ${artist}`.trim());
    }
    let searchHits = [];
    for (const q of searchQueries) {
      const hits = await commonsSearch(q);
      searchHits.push(...hits);
      if (searchHits.length >= 8) break;
    }

    // Gather imageinfo for stage 1+2 candidates
    const lookupTitles = [
      ...p18Files.map((f) => `File:${f.replace(/_/g, " ")}`),
      ...searchHits,
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    if (lookupTitles.length) {
      const info = await imageInfoBatch(lookupTitles);
      const ownCanonical = own?.canonicalTitle ?? `File:${ownTitle}`;
      for (const title2 of lookupTitles) {
        const rec = info.get(title2);
        if (!rec) continue;
        if (rec.canonicalTitle === ownCanonical) continue; // same file we already have
        if (candidates.has(rec.canonicalTitle)) continue;
        if (!/image\/(jpeg|png|tiff)/.test(rec.mime ?? "")) continue;
        if (rec.width * rec.height < localPixels * MIN_GAIN) continue;
        if (!aspectOk(rec.width, rec.height, t.width, t.height)) continue;
        const isP18 = p18Files.some(
          (f) => `File:${f.replace(/_/g, " ")}`.toLowerCase() === rec.canonicalTitle.toLowerCase(),
        );
        candidates.set(rec.canonicalTitle, {
          fileUrl: rec.url,
          commonsPageUrl: rec.descUrl,
          width: rec.width,
          height: rec.height,
          source: isP18 ? "wikidata-p18" : "commons-search",
          thumbUrl: rec.thumbUrl,
          reason: isP18
            ? `Wikidata ${qid} P18 image, ${rec.width}x${rec.height}.`
            : `Commons search hit, ${rec.width}x${rec.height}.`,
        });
      }
    }

    // Merge prior workflow candidates (re-verify below)
    const priorEntry = priorByTarget.get(t.id);
    for (const pc of priorEntry?.candidates ?? []) {
      const fname = filenameFromUploadUrl(pc.fileUrl);
      const key = fname ? `File:${fname.replace(/_/g, " ")}` : pc.fileUrl;
      if (![...candidates.values()].some((c) => c.fileUrl === pc.fileUrl)) {
        candidates.set(key, {
          fileUrl: pc.fileUrl,
          commonsPageUrl: pc.commonsPageUrl,
          width: pc.width,
          height: pc.height,
          source: "prior-workflow",
          thumbUrl: null,
          reason: pc.reason,
        });
      }
    }

    // dHash verification
    const verified = [];
    for (const cand of candidates.values()) {
      let dist = null;
      if (localHash && cand.source !== "own-file") {
        let thumbUrl = cand.thumbUrl;
        if (!thumbUrl) {
          const fname = filenameFromUploadUrl(cand.fileUrl);
          if (fname) {
            thumbUrl = `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(fname)}&width=256`;
          }
        }
        if (thumbUrl) {
          const buf = await politeFetch(thumbUrl, false);
          if (buf) {
            try {
              dist = hamming(localHash, await dHashBuffer(buf));
            } catch {
              /* bad thumb */
            }
          }
        }
      }
      const confidence = confidenceFor(cand.source === "own-file" ? 0 : dist, cand.source);
      verified.push({
        fileUrl: cand.fileUrl,
        commonsPageUrl: cand.commonsPageUrl,
        width: cand.width,
        height: cand.height,
        confidence,
        hamming: cand.source === "own-file" ? 0 : dist,
        source: cand.source,
        reason: cand.reason + (dist != null ? ` dHash distance ${dist}.` : ""),
      });
    }

    verified.sort((a, b) => b.confidence - a.confidence || b.width * b.height - a.width * a.height);
    const kept = verified.filter((c) => c.confidence >= 0.5).slice(0, 4);
    const rejected = verified.length - kept.length;

    results.push({
      target: {
        id: t.id,
        title: t.title,
        englishTitle: t.englishTitle,
        artist: t.artist,
        w: t.width,
        h: t.height,
        fileUrl: t.fileUrl,
        commonsUrl: t.commonsUrl,
        wikidataId: qid,
        objectKey: t.objectKey,
        variantWidths: t.variantWidths,
      },
      candidates: kept,
      summary:
        kept.length === 0
          ? `No verified higher-res replacement found (${verified.length} raw candidates, ${rejected} below confidence threshold).`
          : `${kept.length} verified candidate(s); best is ${kept[0].width}x${kept[0].height} via ${kept[0].source} (${((kept[0].width * kept[0].height) / localPixels).toFixed(1)}x pixels).`,
    });

    process.stderr.write(
      `[${idx}/${targets.length}] ${t.id} -> ${kept.length} candidates (raw ${verified.length})\n`,
    );
  }

  results.sort(
    (a, b) =>
      (b.candidates[0]?.confidence ?? 0) - (a.candidates[0]?.confidence ?? 0) ||
      a.target.id.localeCompare(b.target.id),
  );

  await fs.writeFile(OUT_PATH, `${JSON.stringify(results, null, 2)}\n`);
  const withCands = results.filter((r) => r.candidates.length).length;
  process.stderr.write(
    `\nWrote ${path.relative(ROOT, OUT_PATH)} — ${results.length} targets, ${withCands} with candidates.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
