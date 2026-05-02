#!/usr/bin/env node
// Normalize metadata JSON files in place.
//
//   1. Convert title/description fields containing Wikimedia QuickStatement
//      markup (label QS:Lxx,"...") into a clean English primary value plus a
//      `translations` object keyed by language code, for later i18n use.
//   2. Re-extract `year` more carefully so we ignore uploader/photo EXIF dates
//      like "Taken on 23 August 2022" or "2013-11-05 16:15:40" when the
//      Wikidata creation date (QS:P571 / QS:P1319 / QS:P1326) is available.
//   3. Produce metadata/needs_review_dates.txt listing entries whose best
//      available year is still 1926 or later (candidates for copyright review).
//
// Usage:
//   node scripts/normalize-metadata.mjs                # process default files
//   node scripts/normalize-metadata.mjs foo.json bar.json
//
// Read-only w.r.t. the image files; only rewrites files under metadata/.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_FILES = [
  "collection-of-beauty.json",
  "audubon-birds.json",
  "kunstformen-images.json",
];

const COPYRIGHT_CUTOFF_YEAR = 1926; // today - 100y (2026-04 -> anything >= 1926 is borderline)

// Curated artist DB — used to look up an artist's birth/death years when the
// per-entry artist_info wasn't populated by the upstream fetch script. Lazy-
// loaded on first use so this module stays usable as a library.
let artistsByAlias = null;
function loadArtistsDb() {
  if (artistsByAlias) return artistsByAlias;
  const dbPath = path.join(ROOT, "scripts", "artists-db.json");
  artistsByAlias = new Map();
  if (!fs.existsSync(dbPath)) return artistsByAlias;
  try {
    const { artists } = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    for (const a of artists || []) {
      for (const alias of a.aliases || [a.name]) {
        artistsByAlias.set(alias.toLowerCase(), a);
      }
      artistsByAlias.set(a.name.toLowerCase(), a);
    }
  } catch {
    // ignore — guard just won't fire for unmatched entries
  }
  return artistsByAlias;
}

function artistDates(entry) {
  if (entry.artist_info) return entry.artist_info;
  if (!entry.artist) return null;
  const db = loadArtistsDb();
  const lc = String(entry.artist).toLowerCase();
  if (db.has(lc)) return db.get(lc);
  for (const [alias, a] of db) {
    if (lc.includes(alias) || alias.includes(lc)) return a;
  }
  return null;
}

// --- localization parsing -------------------------------------------------

// Maps a leading "German:" / "French:" etc. prefix to the QS language code, so
// we can recognize and strip prefixes that restate a translation value already
// recorded in label QS:Lxx. Only covers the major languages seen in the corpus.
const LANG_NAME_TO_CODE = {
  german: "de",
  french: "fr",
  spanish: "es",
  italian: "it",
  dutch: "nl",
  polish: "pl",
  russian: "ru",
  japanese: "ja",
  chinese: "zh",
  portuguese: "pt",
  swedish: "sv",
  czech: "cs",
  hungarian: "hu",
  greek: "el",
  turkish: "tr",
  korean: "ko",
  arabic: "ar",
  hebrew: "he",
  danish: "da",
  norwegian: "no",
  finnish: "fi",
  ukrainian: "uk",
  romanian: "ro",
  bulgarian: "bg",
  croatian: "hr",
  serbian: "sr",
  slovak: "sk",
  slovenian: "sl",
  estonian: "et",
  latvian: "lv",
  lithuanian: "lt",
  catalan: "ca",
  basque: "eu",
  galician: "gl",
  persian: "fa",
  latin: "la",
  armenian: "hy",
  vietnamese: "vi",
  thai: "th",
  indonesian: "id",
  belarusian: "be",
  macedonian: "mk",
};

// Split a localized string into:
//   - prefix:       free text before the first QS marker
//   - translations: { langCode: value, ... } (English removed, stored separately)
//   - english:      the English label value if present
//   - had_markup:   true if any QS markers were found
function parseLocalized(raw) {
  if (raw == null) return { english: null, translations: {}, prefix: null, had_markup: false };
  const s = String(raw);

  // Find every occurrence of `label QS:L<code>,` or `title QS:P1476,<code>:`
  const posRe = /(label QS:L([a-z][a-z0-9-]*),|title QS:P1476,([a-z][a-z0-9-]*):)/g;
  const markers = [];
  let m;
  while ((m = posRe.exec(s)) != null) {
    markers.push({
      pos: m.index,
      end: posRe.lastIndex,
      lang: (m[2] || m[3]).toLowerCase(),
      kind: m[0].startsWith("label") ? "label" : "title",
    });
  }

  if (markers.length === 0) {
    return { english: null, translations: {}, prefix: s.trim(), had_markup: false };
  }

  const prefix = s.slice(0, markers[0].pos).trim();

  const byLang = {}; // lang -> { fromLabel, fromTitle }
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].end;
    const end = i + 1 < markers.length ? markers[i + 1].pos : s.length;
    let value = s.slice(start, end).trim();
    if (value.startsWith('"')) value = value.slice(1);
    if (value.endsWith('"')) value = value.slice(0, -1);
    value = value.trim();
    if (!value) continue;
    const slot = byLang[markers[i].lang] || (byLang[markers[i].lang] = {});
    if (markers[i].kind === "label") slot.fromLabel = value;
    else slot.fromTitle = value;
  }

  const translations = {};
  for (const [lang, slot] of Object.entries(byLang)) {
    translations[lang] = slot.fromLabel || slot.fromTitle;
  }

  // Promote English to primary (prefer plain `en`, then `en-gb`).
  let english = translations.en || translations["en-gb"] || null;
  delete translations.en;
  delete translations["en-gb"];

  // If there is no English label, try to recover it from the prefix by
  // stripping off `<LangName>: <value>` fragments whose value matches a known
  // translation. Whatever is left is the English.
  let recovered = null;
  if (!english && prefix) {
    let remaining = prefix;
    let changed = true;
    while (changed) {
      changed = false;
      const pm = remaining.match(/^([A-Z][a-z]+):\s+(.*)$/);
      if (!pm) break;
      const code = LANG_NAME_TO_CODE[pm[1].toLowerCase()];
      if (!code) break;
      const value = translations[code] || byLang[code]?.fromTitle;
      if (value && pm[2].startsWith(value)) {
        remaining = pm[2].slice(value.length).trim();
        changed = true;
      } else {
        break;
      }
    }
    if (remaining && remaining !== prefix) recovered = remaining;
  }

  if (!english && recovered) english = recovered;

  // Last resort: if the prefix looks like clean English (no leading language
  // tag, and no QS markup inside), use it.
  let cleanPrefix = null;
  if (!english && prefix && !/QS:/.test(prefix) && !/^[A-Z][a-z]+:\s/.test(prefix)) {
    cleanPrefix = prefix;
    english = prefix;
  }

  return { english, translations, prefix, had_markup: true };
}

// If a title value is wrapped in literal quote marks from the Commons encoding
// like `""X""` → `"X"`, normalize once more so we end up with just `X` unless
// the quotes are semantically part of the title.
function tidyQuotedValue(s) {
  if (!s) return s;
  const trimmed = s.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

// Filename-derived fallback title: strip extension and decode underscores.
function fallbackFromFilename(fn) {
  if (!fn) return null;
  return fn.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
}

// Normalize a field in the entry. Writes back e[field] as the English value,
// stashes the translations under e.translations[field].
function normalizeField(entry, field) {
  const raw = entry[field];
  if (!raw) return;
  const parsed = parseLocalized(raw);
  if (!parsed.had_markup) return; // already clean

  let english = parsed.english ? tidyQuotedValue(parsed.english) : null;

  if (!english) {
    // No English label we could recover. For titles, prefer a filename-derived
    // fallback over leaving foreign-language prefix garbage in the primary.
    if (field === "title") {
      english = fallbackFromFilename(entry.filename);
    } else if (parsed.prefix) {
      english = parsed.prefix;
    }
  }

  entry[field] = english || raw;

  if (Object.keys(parsed.translations).length > 0) {
    entry.translations = entry.translations || {};
    entry.translations[field] = parsed.translations;
  }
}

// --- year extraction ------------------------------------------------------

// Extract plausible artwork-creation years: 1200-2030. Returns all years in
// textual order. Excludes digits immediately preceded by a letter (so we do
// not read "Monet_w1675" as year 1675 — that is a catalog number).
function yearsFromString(s) {
  if (!s) return [];
  const out = [];
  const re = /(^|[^A-Za-z0-9])(1[2-9][0-9]{2}|20[0-2][0-9]|2030)\b/g;
  let m;
  while ((m = re.exec(s)) != null) out.push(parseInt(m[2], 10));
  return out;
}

// Pattern that signals the `date_created` field is an upload/EXIF photo date
// rather than an artwork creation date. These patterns appear when the
// uploader did not set the artwork "date of creation" on Commons, so the API
// falls back to the EXIF DateTimeOriginal of the photograph of the artwork.
function isUploadDate(s) {
  if (!s) return false;
  const t = s.trim();
  if (/^taken (on|in) /i.test(t)) return true;
  if (/\b\(?\s*(?:original\s+)?upload\s+date\s*\)?/i.test(t)) return true; // "2008 (upload date)", "27 April 2007 (original upload date)"
  if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(t)) return true; // 2013-11-05 16:15:40
  if (/^\d{1,2}\s+\w+\s+\d{4},?\s*\d{2}:\d{2}/.test(t)) return true; // 21 August 2009, 08:09:03
  // "5/12/2011" / "5-12-2011" — slashed/dashed numeric date, year >= 2000.
  // Artists working pre-2000 wouldn't produce a creation-date in this format;
  // it's an uploader's local-format timestamp.
  const slashed = t.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})$/);
  if (slashed && parseInt(slashed[1], 10) >= 2000) return true;
  // Bare ISO date like "2020-11-29" with nothing else — treat as upload date
  // (an artwork date range would be "1886-01-01/1886-12-31"). Wikimedia
  // Commons only launched in 2004, so any year before ~2000 is far more
  // likely to be a legitimate artwork creation date (e.g., "1921-12" for a
  // Hasui print) rather than an upload timestamp.
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const y = parseInt(t.slice(0, 4), 10);
    if (y >= 2000) return true;
  }
  // "2016-10" month granularity — same reasoning
  if (/^\d{4}-\d{2}$/.test(t)) {
    const y = parseInt(t.slice(0, 4), 10);
    if (y >= 2000) return true;
  }
  return false;
}

// Pull a creation year out of `date_created`. Prefers Wikidata QuickStatement
// properties that refer to creation date (P571, P1319 "earliest", P1326
// "latest", P580 "start", P582 "end"); those values are the authoritative
// artwork date set by the uploader. If the field is a bare photo timestamp,
// returns null so the caller can fall back to other sources.
function yearFromDateCreated(dc) {
  if (!dc) return { year: null, source: null };
  const source = null;

  // Wikidata QS markers: `QS:P571,+1884-00-00T00:00:00Z/9` where the trailing
  // `/N` is the precision (11=day, 10=month, 9=year, 8=decade, 7=century,
  // 6=millennium). Anything coarser than year-precision (< 9) is useless —
  // the year value is a midpoint, not an actual creation year — so we skip
  // those and let the P1319/P1326 range markers speak instead.
  //
  // The string can chain multiple properties without repeating `QS:` —
  // e.g. `QS:P,+1150-...,P1319,+1100-...,P1326,+1127-...` — so we allow the
  // `QS:` prefix to be optional.
  const qsRe = /(?:QS:)?P(571|1319|1326|580|582|1480),\+?(-?\d{3,4})-\d{2}-\d{2}T[^,/]*(?:\/(\d+))?/g;
  let best = null;
  let bestProp = null;
  let m;
  while ((m = qsRe.exec(dc)) != null) {
    const prop = m[1];
    const y = parseInt(m[2], 10);
    const precision = m[3] != null ? parseInt(m[3], 10) : 9;
    if (precision < 9) continue; // decade/century/millennium — meaningless as a specific year
    // Prefer P571 (date-of-creation) > P1319 (earliest) > P1326 (latest)
    const rank = prop === "571" ? 0 : prop === "1319" ? 1 : prop === "580" ? 2 : prop === "1326" ? 3 : prop === "582" ? 4 : 5;
    if (best == null || rank < bestProp) {
      best = y;
      bestProp = rank;
    }
  }
  if (best != null) return { year: best, source: "wikidata_qs" };

  if (isUploadDate(dc)) return { year: null, source: null };

  // A bare 4-digit year >= 2000 with no other context is almost certainly the
  // Wikimedia upload year, not the artwork year.
  const bareYear = dc.trim().match(/^(\d{4})$/);
  if (bareYear && parseInt(bareYear[1], 10) >= 2000) return { year: null, source: null };

  // Strip any leading upload-date fragment like "25 November 2014 " before
  // scanning. Pattern: `<DD Month YYYY>` where YYYY >= 1990.
  let scan = dc.replace(/^\d{1,2}\s+\w+\s+(199\d|20\d\d)[,\s]*/, "");
  // Also strip leading ISO date like "2014-11-25 " if followed by more text.
  scan = scan.replace(/^(199\d|20\d\d)-\d{2}-\d{2}[,\s]+/, "");
  // Drop any remaining QS: property clauses — they hold coarse-precision
  // midpoint years that would otherwise get picked up as the creation year.
  // The precision-aware QS scanner above already extracted anything usable.
  scan = scan.replace(/\b(?:QS:)?P\d+,[^A-Za-z]*[^,]*/g, " ");

  // "between 1879 and 1880" / "from 1854 until 1855" / "circa 1498" / "1879"
  const years = yearsFromString(scan);
  if (years.length > 0) return { year: years[0], source: "date_created_plain" };

  return { year: null, source: null };
}

// Attempt to extract a year from the filename. We look for 4-digit years but
// skip Flickr-style all-digit blobs (e.g. "35390682010_..." — that 10-digit
// prefix is a photo id, not a year).
function yearFromFilename(fn) {
  if (!fn) return null;
  const base = fn.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  // Remove obvious photo ID prefixes like "35390682010 "
  const cleaned = base.replace(/\b\d{8,}\b/g, " ");
  const ys = yearsFromString(cleaned);
  if (ys.length === 0) return null;
  // Prefer the *earliest* year because filenames often have both an artwork
  // year and a photo/upload year; the earlier one is the artwork date.
  return Math.min(...ys);
}

// Parse phrases like "late 18th century", "19th century", "early 17th century".
// Returns the decade-ish midpoint of the era as a year (roughly).
function yearFromEraPhrase(s) {
  if (!s) return null;
  const m = String(s).match(/\b(early|mid|late|second half of the|first half of the)?\s*(\d{1,2})\s*(?:st|nd|rd|th)[-\s]?century\b/i);
  if (!m) return null;
  const century = parseInt(m[2], 10);
  if (century < 2 || century > 21) return null;
  const mod = (m[1] || "").toLowerCase();
  const base = (century - 1) * 100;
  if (mod.startsWith("early") || mod.startsWith("first half")) return base + 20;
  if (mod.startsWith("late") || mod.startsWith("second half")) return base + 80;
  return base + 50;
}

// Japanese era dates — very common in our corpus ("大正12年出版" = Taishō 12 = 1923).
const JP_ERAS = [
  { re: /明治(\d+)年/, start: 1868 }, // Meiji
  { re: /大正(\d+)年/, start: 1912 }, // Taishō
  { re: /昭和(\d+)年/, start: 1926 }, // Shōwa
  { re: /平成(\d+)年/, start: 1989 }, // Heisei
  { re: /令和(\d+)年/, start: 2019 }, // Reiwa
];
function yearFromJapaneseEra(s) {
  if (!s) return null;
  for (const { re, start } of JP_ERAS) {
    const m = String(s).match(re);
    if (m) return start - 1 + parseInt(m[1], 10);
  }
  return null;
}

function resolveYear(entry) {
  // Reject any candidate year that falls outside the artist's documented
  // working life. Artists do not produce work before being born or after
  // dying. The "+1 / -10" slack covers 1-year posthumous publication and
  // child-prodigy starts; everything else is a stray number masquerading as
  // a date — usually an upload timestamp (post-died) or a Wildenstein-style
  // catalog number ("Monet W.1200") (pre-born).
  const dates = artistDates(entry);
  const born = dates?.born;
  const died = dates?.died;
  const isPlausible = (y) => {
    if (y == null) return true;
    if (typeof died === "number" && y > died + 1) return false;
    if (typeof born === "number" && y < born - 10) return false;
    return true;
  };

  const fromDc = yearFromDateCreated(entry.date_created);
  if (fromDc.year != null && isPlausible(fromDc.year))
    return { year: fromDc.year, source: fromDc.source };

  const jp = yearFromJapaneseEra(entry.date_created);
  if (jp != null && isPlausible(jp)) return { year: jp, source: "jp_era" };

  const fnYear = yearFromFilename(entry.filename);
  if (fnYear != null && isPlausible(fnYear))
    return { year: fnYear, source: "filename" };

  // Title (strip the QS markup first so we do not pick years out of Wikidata IDs)
  const titleClean = String(entry.title || "").replace(/QS:[^ ]+/g, " ");
  const ts = yearsFromString(titleClean).filter(isPlausible);
  if (ts.length) return { year: Math.min(...ts), source: "title" };

  const descClean = String(entry.description || "").replace(/QS:[^ ]+/g, " ");
  const ds = yearsFromString(descClean).filter(isPlausible);
  if (ds.length) return { year: Math.min(...ds), source: "description" };

  // Era phrases like "late 18th century"
  const eraDc = yearFromEraPhrase(entry.date_created);
  if (eraDc != null && isPlausible(eraDc))
    return { year: eraDc, source: "era_phrase" };
  const eraDesc = yearFromEraPhrase(entry.description);
  if (eraDesc != null && isPlausible(eraDesc))
    return { year: eraDesc, source: "era_phrase" };

  return { year: null, source: null };
}

// If we still have no explicit year but the enriched artist_info tells us the
// artist died long before the copyright cutoff, the work is inherently old.
function safelyOldByArtistDeath(entry) {
  const died = artistDates(entry)?.died;
  if (typeof died !== "number") return false;
  // Artist died more than 100 years before our cutoff of 1926? They are
  // conclusively pre-cutoff. Use died + 0 < COPYRIGHT_CUTOFF_YEAR.
  return died < COPYRIGHT_CUTOFF_YEAR;
}

// --- pipeline -------------------------------------------------------------

function processFile(relPath) {
  const full = path.join(ROOT, "metadata", relPath);
  if (!fs.existsSync(full)) {
    console.log(`[skip] ${relPath} (not found)`);
    return { file: relPath, suspects: [] };
  }
  const d = JSON.parse(fs.readFileSync(full, "utf8"));
  if (!d.entries) {
    console.log(`[skip] ${relPath} (no entries map)`);
    return { file: relPath, suspects: [] };
  }

  let titleRewrites = 0;
  let descRewrites = 0;
  let yearChanges = 0;
  const suspects = [];

  for (const [fn, entry] of Object.entries(d.entries)) {
    const beforeTitle = entry.title;
    const beforeDesc = entry.description;
    normalizeField(entry, "title");
    normalizeField(entry, "description");
    if (entry.title !== beforeTitle) titleRewrites++;
    if (entry.description !== beforeDesc) descRewrites++;

    const prevYear = entry.year;
    const { year, source } = resolveYear(entry);
    if (year !== prevYear) {
      entry.year = year;
      yearChanges++;
    }
    if (source) entry.year_source = source;
    else delete entry.year_source;

    if (year != null && year >= COPYRIGHT_CUTOFF_YEAR) {
      suspects.push({
        kind: "recent",
        filename: fn,
        year,
        year_source: source,
        artist: entry.artist,
        title: entry.title,
        date_created: entry.date_created,
      });
    } else if (year == null && !safelyOldByArtistDeath(entry)) {
      suspects.push({
        kind: "unknown",
        filename: fn,
        year: null,
        year_source: null,
        artist: entry.artist,
        title: entry.title,
        date_created: entry.date_created,
      });
    }
  }

  fs.writeFileSync(full, JSON.stringify(d, null, 2));
  console.log(
    `[${relPath}] rewrote titles: ${titleRewrites}, descriptions: ${descRewrites}, year changes: ${yearChanges}, suspect years: ${suspects.length}`,
  );
  return { file: relPath, suspects };
}

// --- main ----------------------------------------------------------------

const args = process.argv.slice(2);
const files = args.length ? args : DEFAULT_FILES;

const allSuspects = [];
for (const f of files) {
  const { file, suspects } = processFile(f);
  for (const s of suspects) allSuspects.push({ file, ...s });
}

// Write two review lists: one for items whose year looks genuinely recent
// (>= 1926), one for items where no year was recoverable. The first is what
// actually needs to be deleted / replaced; the second is a lower-priority
// manual audit.
function renderSuspect(s) {
  const y = s.year == null ? "????" : String(s.year);
  const src = s.year_source ? `[${s.year_source}]` : "[none]";
  const out = [];
  out.push(`${y} ${src.padEnd(22)} ${s.artist || "?"} — ${s.title || "?"}`);
  out.push(`       file: ${s.filename}`);
  if (s.date_created) out.push(`       date_created: ${s.date_created}`);
  out.push("");
  return out.join("\n");
}

function writeReport(items, outName, header) {
  if (!items.length) return;
  const grouped = new Map();
  for (const s of items) {
    if (!grouped.has(s.file)) grouped.set(s.file, []);
    grouped.get(s.file).push(s);
  }
  const lines = [];
  lines.push(...header);
  lines.push("");
  for (const [file, group] of grouped) {
    group.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || a.filename.localeCompare(b.filename));
    lines.push(`## ${file}  (${group.length})`);
    lines.push("");
    for (const s of group) lines.push(renderSuspect(s));
    lines.push("");
  }
  const outPath = path.join(ROOT, "metadata", outName);
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Wrote ${items.length} entries to ${outPath}`);
}

const recent = allSuspects.filter((s) => s.kind === "recent");
const unknown = allSuspects.filter((s) => s.kind === "unknown");

console.log("");
writeReport(recent, "needs_review_dates.txt", [
  "# Copyright review — looks recent",
  `# Generated: ${new Date().toISOString()}`,
  `# Cutoff: year < ${COPYRIGHT_CUTOFF_YEAR} (artwork must be at least 100 years old).`,
  `# Entries here have year >= ${COPYRIGHT_CUTOFF_YEAR} after heuristic re-extraction,`,
  "# so they may be copyrighted. Review and remove if they cannot be",
  "# confirmed as public domain.",
]);

writeReport(unknown, "needs_review_dates.unknown.txt", [
  "# Copyright review — year unknown",
  `# Generated: ${new Date().toISOString()}`,
  "# We could not recover any artwork-creation year from the metadata, the",
  "# filename, the title, the description, or the artist's death year. These",
  "# require human review to decide whether to keep or drop.",
]);
