#!/usr/bin/env node
// One-off scraper for Nicholas Rougeux's restoration of Pierre-Joseph
// Redouté's *Les Liliacées* (c82.net/redoute/lilies). Not a Wikimedia
// source, so it bypasses scrape:fetch and writes metadata/redoute-lilies.json
// directly in the same shape build-data.mjs consumes (entries map).
//
// For each plate it pulls the Latin title, French subtitle, plate number,
// the original French description, the Linnaean/Jussieu classification, and
// downloads the high-res restored plate (the "-light" variant — the plate on
// cream paper, faithful to the original stipple engraving) into
// assets/redoute-lilies/<slug>.jpg.
//
// Polite: single-threaded, ~300ms between requests, retries once on failure.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets", "redoute-lilies");
const META_PATH = path.join(ROOT, "metadata", "redoute-lilies.json");
const BASE = "https://www.c82.net";
const TIMELINE = `${BASE}/redoute/lilies/timeline`;
const UA = "CollectionOfBeautyIngest/1.0 (personal; ricotrebeljahr@gmail.com)";
const DELAY_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- HTML entity decode (French Latin-1 + typographic punctuation) ----------
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  agrave: "à", aacute: "á", acirc: "â", auml: "ä", aring: "å", atilde: "ã",
  igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ograve: "ò", oacute: "ó", ocirc: "ô", ouml: "ö", otilde: "õ", oslash: "ø",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü",
  ccedil: "ç", ntilde: "ñ", yacute: "ý", yuml: "ÿ",
  Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Acirc: "Â",
  Ccedil: "Ç", Ouml: "Ö", Uuml: "Ü", Auml: "Ä",
  oelig: "œ", OElig: "Œ", aelig: "æ", AElig: "Æ", szlig: "ß",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  hellip: "…", ndash: "–", mdash: "—", deg: "°", times: "×",
  laquo: "«", raquo: "»", middot: "·", sect: "§", para: "¶",
};

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

function stripTags(s) {
  return decodeEntities(
    s
      .replace(/<cite>/gi, "")
      .replace(/<\/cite>/gi, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

async function fetchText(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000);
    }
  }
}

async function fetchBuffer(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000);
    }
  }
}

// --- parse the timeline → slug → { volume, year } ---------------------------
function parseTimeline(html) {
  const map = new Map();
  const sections = html.split("<div class='gallery-section'>").slice(1);
  for (const s of sections) {
    const hm = s.match(/gallery-section-subhead'>([^<]+)<\/span>\s*([0-9]{4})/);
    const volume = hm ? hm[1].trim() : null;
    const year = hm ? Number(hm[2]) : null;
    const slugs = new Set([...s.matchAll(/\/redoute\/flower\/([a-z0-9-]+)/g)].map((m) => m[1]));
    for (const slug of slugs) {
      if (!map.has(slug)) map.set(slug, { volume, year });
    }
  }
  return map;
}

// --- parse a single flower page ---------------------------------------------
function parseFlower(html) {
  const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1];
  const subtitle = (html.match(/flower-cover-title-subtitle'>([^<]*)</) || [])[1];
  const plateType = (html.match(/flower-cover-type'>([^<]*)</) || [])[1]; // "lilies plate #1"
  const plateNum = (() => {
    const m = (plateType || "").match(/#\s*(\d+)/);
    return m ? Number(m[1]) : null;
  })();

  // Download link → the large plate. href is the "-dark" treatment; swap to
  // "-light" (plate on cream paper, faithful to the original engraving).
  const dlHref = (html.match(/download='[^']*'\s+href='([^']+)'/) || html.match(/href='([^']*\/large\/[^']+)'/) || [])[1];
  const imgUrl = dlHref ? `${BASE}${dlHref.replace(/-dark\.jpg$/i, "-light.jpg")}` : null;

  // French description: everything inside <div class='flower-description'>
  // between <h2>Description</h2> and the next <h2>.
  let descFr = null;
  const descBlock = html.match(/flower-description'[^>]*>([\s\S]*?)<div aria-label='Nomenclature'/);
  if (descBlock) {
    const seg = descBlock[1];
    const descSec = seg.match(/<h2>Description<\/h2>([\s\S]*?)(?:<h2>|$)/);
    if (descSec) {
      const paras = [...descSec[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1]));
      descFr = paras.filter(Boolean).join("\n\n") || null;
    }
  }

  // Classification line (family / Linnaean class).
  const classFr = (() => {
    const m = html.match(/classification'>\s*<p>([\s\S]*?)<\/p>/);
    return m ? stripTags(m[1]) : null;
  })();

  return {
    title: title ? decodeEntities(title).trim() : null,
    subtitle: subtitle ? decodeEntities(subtitle).trim() : null,
    plateNum,
    imgUrl,
    descFr,
    classFr,
  };
}

async function main() {
  await mkdir(ASSETS_DIR, { recursive: true });

  console.log("Fetching timeline…");
  const timelineHtml = await fetchText(TIMELINE);
  const volMap = parseTimeline(timelineHtml);
  const slugs = [...volMap.keys()].sort();
  console.log(`Found ${slugs.length} plates.`);

  // Resume support: keep already-built entries.
  let entries = {};
  if (existsSync(META_PATH)) {
    try {
      entries = JSON.parse(await readFile(META_PATH, "utf8")).entries || {};
    } catch {}
  }

  let done = 0;
  let fetched = 0;
  for (const slug of slugs) {
    done++;
    const filename = `${slug}.jpg`;
    const imgPath = path.join(ASSETS_DIR, filename);
    const haveImg = existsSync(imgPath);
    const haveEntry = !!entries[filename];
    if (haveImg && haveEntry) continue;

    const { volume, year } = volMap.get(slug);
    const pageUrl = `${BASE}/redoute/flower/${slug}`;

    let parsed;
    try {
      const html = await fetchText(pageUrl);
      parsed = parseFlower(html);
    } catch (err) {
      console.error(`  [${done}/${slugs.length}] PAGE FAIL ${slug}: ${err.message}`);
      await sleep(DELAY_MS);
      continue;
    }

    if (!parsed.imgUrl) {
      console.error(`  [${done}/${slugs.length}] NO IMAGE ${slug}`);
      await sleep(DELAY_MS);
      continue;
    }

    if (!haveImg) {
      await sleep(DELAY_MS);
      try {
        const buf = await fetchBuffer(parsed.imgUrl);
        await writeFile(imgPath, buf);
      } catch (err) {
        console.error(`  [${done}/${slugs.length}] IMG FAIL ${slug}: ${err.message}`);
        await sleep(DELAY_MS);
        continue;
      }
    }

    const title = parsed.title || slug.replace(/-/g, " ");
    entries[filename] = {
      filename,
      resolved: true,
      needs_review: false,
      title,
      artist: "Pierre-Joseph Redouté",
      date_created: `between ${year} and ${year + 2}`,
      year,
      description: parsed.descFr || `Botanical plate of ${title} from Pierre-Joseph Redouté's Les Liliacées.`,
      source: {
        type: "c82.net",
        canonical_title: `${title}${parsed.plateNum ? ` — Les Liliacées plate ${parsed.plateNum}` : ""}`,
        url: pageUrl,
        file_url: parsed.imgUrl,
        credit: "Restoration by Nicholas Rougeux (c82.net), after Pierre-Joseph Redouté",
        permission: "Public domain",
        attribution: null,
      },
      copyright: {
        copyrighted: false,
        license_short: "Public domain",
        license_url: "https://www.c82.net/redoute/about#licensing",
        usage_terms: "Public domain",
      },
      artist_info: {
        name: "Pierre-Joseph Redouté",
        aliases: ["Pierre-Joseph Redouté", "Redouté"],
        born: 1759,
        died: 1840,
        nationality: "Belgian / French",
        movement: "Natural history illustration",
      },
      plate: parsed.plateNum,
      volume,
      subtitle_fr: parsed.subtitle || null,
      classification_fr: parsed.classFr || null,
    };
    fetched++;

    if (fetched % 20 === 0) {
      await writeFile(META_PATH, serialize(entries));
      console.log(`  [${done}/${slugs.length}] checkpoint (${fetched} new)`);
    }
    await sleep(DELAY_MS);
  }

  await writeFile(META_PATH, serialize(entries));
  const resolved = Object.values(entries).filter((e) => e.resolved).length;
  console.log(`\nDone. ${Object.keys(entries).length} entries (${fetched} newly fetched), ${resolved} resolved.`);
  console.log(`Wrote ${path.relative(ROOT, META_PATH)}`);
}

function serialize(entries) {
  // Match the audubon-birds.json envelope so build-data + downstream tools
  // treat it identically.
  const sortedKeys = Object.keys(entries).sort();
  const sortedEntries = {};
  for (const k of sortedKeys) sortedEntries[k] = entries[k];
  const file = {
    folder: "redoute-lilies",
    kind: "c82_image_collection",
    generated_at: new Date().toISOString(),
    source_api: "https://www.c82.net/redoute (Nicholas Rougeux restoration)",
    file_count: sortedKeys.length,
    resolved_count: Object.values(entries).filter((e) => e.resolved).length,
    unresolved_count: Object.values(entries).filter((e) => !e.resolved).length,
    entries: sortedEntries,
  };
  return JSON.stringify(file, null, 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
