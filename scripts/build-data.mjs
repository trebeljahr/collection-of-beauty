import { closeSync, existsSync, openSync, readSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, "metadata");
const ASSETS = path.join(ROOT, "assets");
const ASSETS_WEB = path.join(ROOT, "assets-web");
const OUT = path.join(ROOT, "src", "data");

// Probe only the first 64 KB of each image to extract width/height — enough
// for every format we have (jpg/png/webp/tif). Reading full files would OOM
// the container on the larger 16 MB plates.
const PROBE_BYTES = 64 * 1024;
const probeBuf = Buffer.alloc(PROBE_BYTES);
const dimensionCache = new Map();

// Scan assets-web/<folder>/<basename>/ for pre-built variant files
// (emitted by `pnpm shrink`). Returns the sorted list of widths for
// which at least one format (AVIF preferred, WebP acceptable) exists.
// Lets the runtime skip fetches for variants that don't exist yet,
// which eliminates the 404 noise on artworks that haven't been shrunk.
const variantsCache = new Map();
function variantWidthsFor(folderKey, filename) {
  const key = `${folderKey}/${filename}`;
  if (variantsCache.has(key)) return variantsCache.get(key);
  const basename = filename.replace(/\.[^.]+$/, "");
  const dir = path.join(ASSETS_WEB, folderKey, basename);
  let widths = [];
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir);
      const set = new Set();
      for (const f of files) {
        const m = f.match(/^(\d+)\.(avif|webp)$/i);
        if (m) set.add(Number.parseInt(m[1], 10));
      }
      widths = Array.from(set).sort((a, b) => a - b);
    } catch {
      // leave empty
    }
  }
  variantsCache.set(key, widths);
  return widths;
}

function dimensionsFor(folderKey, filename) {
  const key = `${folderKey}/${filename}`;
  if (dimensionCache.has(key)) return dimensionCache.get(key);
  let result = null;
  const file = path.join(ASSETS, folderKey, filename);
  if (existsSync(file)) {
    try {
      const fd = openSync(file, "r");
      const n = readSync(fd, probeBuf, 0, PROBE_BYTES, 0);
      closeSync(fd);
      const slice = n < PROBE_BYTES ? probeBuf.subarray(0, n) : probeBuf;
      const { width, height } = imageSize(slice);
      if (width && height) result = { width, height };
    } catch {
      // leave null
    }
  }
  dimensionCache.set(key, result);
  return result;
}

const WIKIMEDIA_FOLDERS = ["collection-of-beauty", "audubon-birds", "kunstformen-images"];

function assertRequiredAssetsAvailable() {
  if (!existsSync(ASSETS)) {
    throw new Error(
      `[build-data] Missing ${path.relative(ROOT, ASSETS)}/. ` +
        "Download or mount source assets before generating src/data.",
    );
  }

  const missingFolders = WIKIMEDIA_FOLDERS.filter(
    (folder) => !existsSync(path.join(ASSETS, folder)),
  );
  if (missingFolders.length > 0) {
    throw new Error(
      `[build-data] Missing asset folder(s): ${missingFolders
        .map((folder) => path.join("assets", folder))
        .join(", ")}. Run the download scripts or restore the asset archive before building.`,
    );
  }
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping NFKD combining marks is the intent
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function stripQuickStatements(input) {
  if (!input) return input;
  return input
    .replace(/\s*(title|label)\s+QS:[^,]+(,[^,]+)*/g, "")
    .replace(/\s*date\s+QS:[^,\s]+(,[^,\s]+)*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip the leading EXIF / upload-timestamp prefix that creeps onto
// some Commons titles when the uploader didn't set a proper Object
// Name. Patterns seen in metadata/*.json:
//   "2022-06-24 at 13-35-16 Pêches (C Monet - W 952)"  ← the worst
//   "2014-11-25 16:15:40 Some title"
//   "21 August 2009, 08:09:03 - Title"
function stripUploadTimestamp(s) {
  if (!s) return s;
  return s
    .replace(/^\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}-\d{2}-\d{2}\s+/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(:\d{2})?\s+/, "")
    .replace(/^\d{1,2}\s+\w+\s+\d{4},?\s*\d{2}:\d{2}(:\d{2})?\s*-?\s*/, "")
    .trim();
}

// Treat a string as "needs an English fallback" when the visible
// content is overwhelmingly non-Latin (CJK, Cyrillic, Arabic, Hebrew,
// Devanagari, etc.). Latin-with-diacritics is fine — French/Italian/
// German titles read perfectly well in this gallery.
function isMostlyNonLatin(s) {
  if (!s) return false;
  let nonLatin = 0;
  let letters = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (/[^\s\d.,;:!?'"()&\-]/u.test(ch)) letters++;
    // Latin Basic + Latin-1 Supplement + Latin Extended-A + Latin Extended-B
    // run from U+0000 through U+024F. Anything past that we treat as
    // non-Latin script.
    if (code > 0x024f) nonLatin++;
  }
  return letters > 0 && nonLatin / letters > 0.5;
}

// Many Met / Wikipedia scans bake an English title into the filename
// alongside the original-language name, e.g.
//   "2560px-冨嶽三十六景_上総の海路-At_Sea_off_Kazusa_(Kazusa_no_kairo)
//      ,_from_the_series_Thirty-six_Views_of_Mount_Fuji
//      _(Fugaku_sanjūrokkei)_MET_DP141056.jpg"
// The pattern is `<resolution>-<original>-<English>_MET_<id>.<ext>`,
// so split on `-`, drop the trailing source-id chunk, and pick the
// segment with the most ASCII letters.
function englishFromFilename(fname) {
  if (!fname) return null;
  let base = fname.replace(/\.[^.]+$/, "");
  base = base.replace(/_MET_\w+$/i, ""); // Met DP id suffix
  base = base.replace(/_\(\d+\)$/, ""); // trailing "(2)" disambiguator
  // Split on dashes that act as SECTION separators, not word-internal
  // hyphens. A section dash has at least one non-Latin neighbour (a CJK
  // character, an underscore, or end-of-string); a word-internal dash
  // like "Thirty-six" has Latin letters on both sides.
  const parts = base
    .split(/(?<=[^A-Za-z])-|-(?=[^A-Za-z])/)
    .map((p) => p.replace(/_/g, " ").trim())
    .filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const p of parts) {
    if (/^\d+(px|p)$/i.test(p)) continue; // resolution prefix
    const latin = (p.match(/[A-Za-z]/g) || []).length;
    if (latin < 8) continue; // need a real phrase, not a stray word
    if (latin / p.length < 0.5) continue;
    if (latin > bestScore) {
      best = p;
      bestScore = latin;
    }
  }
  return best;
}

// Some `source.credit` values are just Commons license-template
// boilerplate scraped along with real provenance ("This image is
// available from the United States Library of Congress…", "print
// scan", bare "Public Domain", etc.). They convey nothing the license
// badge doesn't already, so detect and drop them.
function looksLikeBoilerplate(text) {
  if (!text) return true;
  const t = String(text).trim();
  if (t.length < 10) return true;
  if (/^https?:\/\/\S+$/.test(t)) return true;

  const lower = t.toLowerCase();
  if (lower === "print scan") return true;
  if (lower === "public domain") return true;

  if (
    /this tag does not indicate/i.test(t) ||
    /commons:licensing/i.test(t) ||
    /a normal copyright tag/i.test(t) ||
    /this image is available from/i.test(t)
  ) {
    return true;
  }

  // Bare "digital ID xyz" with no surrounding prose.
  if (/digital id/i.test(t) && t.length < 50) return true;

  return false;
}

// `entry.source.credit` is the Wikimedia uploader's free-text entry,
// often "Own work" (the uploader photographed the painting themselves
// — true but uninformative for attribution) or a museum/auction
// reference. Drop the boilerplate so the artwork detail page doesn't
// render attribution noise.
function cleanCredit(raw) {
  if (!raw) return null;
  const c = String(raw).trim();
  if (!c) return null;
  if (/^own\s*work$/i.test(c)) return null;
  if (looksLikeBoilerplate(c)) return null;
  return c;
}

/** Specific titles that aren't fixed by any pattern rule — typos,
 *  museum-tagged suffixes, "by Artist (year, museum)" trailers
 *  baked into the title field. NFC-normalised for stable matching
 *  across composed/decomposed Unicode (e.g. "Sesshū" stored as a
 *  precomposed glyph vs u + combining macron). Mirror set lives in
 *  src/components/gallery-dungeon/painting.tsx so the runtime
 *  formatter catches anything that slips past the build. */
const TITLE_REWRITES = new Map(
  [
    [
      "Tenman Bridge at Settsu Province (Sesshū Tenmanbashi), from the series Remarkable Views of Bridges in Various Provinces (Shokoku meikyō kiran)",
      "Tenman Bridge at Settsu Province (Sesshū Tenmanbashi)",
    ],
    [
      "Wang Meng Dwelling in the Qingbian Mountains. ink on paper. 1366. 141x42",
      "Dwelling in the Qingbian Mountains",
    ],
    [
      "At first glance he looks very fiarce, but he s really a nice person",
      "At first glance he looks fierce, but he's really a nice person",
    ],
    [
      "Moreno Garden Bordighera 1884 - The Norton Museum Miami Florida",
      "Moreno Garden, Bordighera",
    ],
    [
      "Mt. Heng, after Juran (active ca. 960–965), from the Mustard Seed Garden Manual of Painting MET DP",
      "Mt. Heng, after Juran, from the Mustard Seed Garden Manual of Painting",
    ],
    [
      "Alexandra and Elena Pavlovna of Russia by E.Vigee-Lebrun (1796, Hermitage)",
      "Alexandra and Elena Pavlovna of Russia",
    ],
    [
      "An Experiment on a Bird in an Air Pump by Joseph Wright 'of Derby",
      "An Experiment on a Bird in an Air Pump",
    ],
    [
      "Famous Views of the 60 Provinces - #23. Yoro Waterfall in Mino Province",
      "Yoro Waterfall in Mino Province",
    ],
    [
      "36 Views of Mt. Fuji - #11. Wild Goose Hill and the Tone River",
      "Wild Goose Hill and the Tone River",
    ],
    [
      "A Frank Encampment in the Desert of Mount Sinai. 1842 - The Convent of St. Catherine in the Distance",
      "A Frank Encampment in the Desert of Mount Sinai",
    ],
  ].map(([k, v]) => [k.normalize("NFC"), v]),
);

const TRAILING_ABBREV_RX =
  /\b(Mr|Mrs|Ms|Dr|St|Sr|Jr|Inc|Co|Ltd|fl|ca|cm|in|d\. ?J|d\. ?Ä|etc|vs|Ave|Blvd|i\.e|e\.g)\.$/i;

function cleanTitle(raw, fname, artist) {
  const fallback = (fname ?? "").replace(/\.[^.]+$/, "").replace(/[_]/g, " ");
  if (!raw) return fallback;

  // 1. Drop QuickStatements clutter and bracketed asides; commas often
  //    fold a date / location after the actual title.
  const first = raw.split(/[,(]/)[0];
  let cleaned = stripQuickStatements(first)
    .replace(/^["']|["']$/g, "")
    .trim();

  // 2. Strip leading upload timestamps.
  cleaned = stripUploadTimestamp(cleaned);

  // 3. If what's left is overwhelmingly non-Latin, look for an English
  //    title baked into the filename.
  if (cleaned && isMostlyNonLatin(cleaned)) {
    const english = englishFromFilename(fname);
    if (english) cleaned = english;
  }

  cleaned = cleaned || fallback;

  // 4. Targeted rewrites for titles that no general rule cleans up.
  const rewrite = TITLE_REWRITES.get(cleaned.normalize("NFC"));
  if (rewrite) return rewrite;

  // 5. Generic late-stage cleanups for whatever slipped through:
  //    — Hokusai-style ", from the series ..." suffix that the
  //      filename-extracted English title sometimes preserves.
  //    — " - Google Art Project" / " - Google Cultural Institute"
  //      dataset breadcrumbs and "C2RMF retouched" technical noise.
  //    — "MET DP" identifier the filename extractor doesn't always
  //      strip cleanly.
  //    — " - {ArtistLastName}" prefix when the filename mirrors the
  //      "Artist - Title" Wikipedia naming convention.
  const seriesIdx = cleaned.indexOf(", from the series ");
  if (seriesIdx > 0) cleaned = cleaned.slice(0, seriesIdx).trim();
  cleaned = cleaned
    .replace(/\s+-\s+Google Art Project$/i, "")
    .replace(/\s+-\s+Google Cultural Institute$/i, "")
    .replace(/\s+C2RMF(\s+retouched)?\s*$/i, "")
    .replace(/\s+MET\s+DP[\w\d]*$/i, "");

  if (artist) {
    const a = String(artist).trim();
    if (a.length > 1) {
      const fullPrefix = `${a} - `;
      if (cleaned.toLowerCase().startsWith(fullPrefix.toLowerCase())) {
        cleaned = cleaned.slice(fullPrefix.length).trim();
      } else {
        const tokens = a.split(/\s+/);
        const last = tokens[tokens.length - 1];
        if (last && last.length > 2) {
          const lastPrefix = `${last} - `;
          if (cleaned.toLowerCase().startsWith(lastPrefix.toLowerCase())) {
            cleaned = cleaned.slice(lastPrefix.length).trim();
          }
        }
      }
    }
  }

  // 6. Trailing period — descriptive titles often end in `.` from the
  // source; museum convention drops it. Skip abbreviations.
  if (
    cleaned.endsWith(".") &&
    !cleaned.endsWith("..") &&
    !TRAILING_ABBREV_RX.test(cleaned)
  ) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  return cleaned;
}

// Pull a few sentences out of the raw description rather than the
// single-sentence cut we used to take. Lots of source descriptions are
// 2–3 short sentences (subject, medium, provenance) and truncating to
// the first one threw away the most informative parts.
function firstLineDescription(raw) {
  if (!raw) return null;
  const t = stripQuickStatements(raw).trim();
  if (!t) return null;
  // Split into sentence-ish chunks while keeping the punctuation.
  const sentences = t.match(/[^.!?\n]+[.!?]?/g) || [t];
  const out = [];
  let len = 0;
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (out.length === 0 && piece.length < 8) continue;
    if (len + piece.length > 600) break;
    out.push(piece);
    len += piece.length + 1;
    if (out.length >= 3) break;
  }
  const joined = out.join(" ").trim();
  if (joined.length < 8) return null;
  return joined;
}

function extractYear(entry) {
  // normalize-metadata.mjs writes `year: null` deliberately when date_created
  // is an upload timestamp / EXIF photo date. Respect that — the previous
  // fallback of "any 4-digit number in date_created" picked the upload year
  // back up and produced impossible artwork dates (Monets in the 2000s).
  if ("year" in entry) return entry.year;
  if (!entry.date_created) return null;
  const m = entry.date_created.match(/\b(\d{3,4})\b/);
  return m ? Number(m[1]) : null;
}

function keepEntry(entry) {
  if (!entry.source?.file_url) return false;
  if (entry.needs_review) return false;
  // URAA-restricted works are PD in the source country but still copyrighted
  // in the US — drop them regardless of the Commons license tag, which only
  // reflects the source-country status.
  if (entry.pd_status === "uraa_restricted") return false;
  const cp = entry.copyright;
  if (!cp) return false;
  if (cp.copyrighted === false) return true;
  const lic = (cp.license_short || "").toLowerCase();
  if (!lic) return false;
  return (
    lic.includes("cc0") ||
    lic.includes("cc by") ||
    lic.includes("public") ||
    lic.includes("no restrictions")
  );
}

function normalizeArtistName(raw) {
  if (!raw) return null;
  // "Unknown author/artist/photographer" placeholders are no information at
  // all; render as null so the artist field stays blank rather than echoing
  // the placeholder.
  if (/^\s*(unknown|anonymous)(\s+(author|artist|painter|photographer|maker))?(\s+\1)?\s*\.?\s*$/i.test(raw))
    return null;
  // Wikimedia free-text Artist sometimes appends biographical and publisher
  // tails like "Utagawa Kuniyoshi; Utagawa Kuniyoshi died 1861; Iseya Rihei"
  // — keep just the maker.
  let s = raw.includes(";") ? raw.split(";")[0] : raw;
  s = stripQuickStatements(s);
  s = s.replace(/\s*\([^)]*\)/g, "");

  // Trailing Google Art Project / Met / Wikipedia boilerplate.
  s = s.replace(/\bDetails on Google Art Project\b.*$/i, "");
  // Trailing free-form date ranges left over from "(1832–1904) Details ...".
  s = s.replace(/[,\-–]?\s*\b1[5-9]\d{2}\s*[-–/]\s*1[5-9]\d{2}\b.*$/, "");
  // "Lastname, Firstname" → "Firstname Lastname" when the right-hand side is
  // just one or two given-name tokens (no nationality, no role).
  const flip = s.match(
    /^([A-ZÀ-ÖØ-Þ][\p{L}'’\-]+)\s*,\s*([A-ZÀ-ÖØ-Þ][\p{L}'’\-]+(?:\s+[a-zà-öø-þ][\p{L}'’\-]+)?(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’\-]+)?)\s*$/u,
  );
  if (flip) s = `${flip[2]} ${flip[1]}`;
  // Otherwise drop nationality/role tail after the first comma (e.g.
  // "Mary Stevenson Cassatt, American, 1844 - 1926, artist." → "Mary
  // Stevenson Cassatt").
  else if (s.includes(",")) s = s.split(",")[0];

  s = s.replace(/\b(artist|painter|sculptor|unknown)\b/gi, "").trim();
  // "Sir " title prefix from auction catalogues; harmless honorific.
  s = s.replace(/^Sir\s+/i, "");
  // Once Latin content is present, drop trailing CJK glyphs (e.g.
  // "Chen Rong 陳容 陈容" → "Chen Rong"). Don't touch fully-CJK names.
  if (/[A-Za-z]/.test(s)) {
    // Anything from the first CJK glyph onward is a redundant native-
    // script gloss or biographical tail.
    s = s.replace(/\s*[　-鿿豈-﫿][\s\S]*$/u, "");
  }
  // Strip trailing punctuation/dashes left over from earlier substitutions.
  s = s.replace(/[\s\-–—.,;:/]+$/u, "");
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

function fold(s) {
  // NFKD + strip combining marks so "Vigée" and "Vigee" collide.
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function loadArtistsDb() {
  const raw = await readFile(path.join(ROOT, "scripts", "artists-db.json"), "utf8");
  const { artists } = JSON.parse(raw);
  const byAlias = new Map();
  for (const a of artists) {
    for (const alias of a.aliases || [a.name]) {
      byAlias.set(fold(alias), a);
    }
    byAlias.set(fold(a.name), a);
  }
  return { artists, byAlias };
}

function matchArtist(name, byAlias) {
  if (!name) return null;
  const low = fold(name);
  if (byAlias.has(low)) return byAlias.get(low);
  for (const [alias, a] of byAlias) {
    if (low.includes(alias) || alias.includes(low)) return a;
  }
  return null;
}

function buildMovementGroups(artists) {
  const groups = new Map();
  for (const a of artists) {
    if (!a.movement) continue;
    if (!groups.has(a.movement)) groups.set(a.movement, []);
    groups.get(a.movement).push(a);
  }
  return groups;
}

function overlapYears(a, b) {
  const aStart = a.born ?? 0;
  const aEnd = a.died ?? 2100;
  const bStart = b.born ?? 0;
  const bEnd = b.died ?? 2100;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

const KNOWN_CONNECTIONS = [
  ["Claude Monet", "Édouard Manet", "contemporaries in Impressionist circle"],
  ["Claude Monet", "Pierre-Auguste Renoir", "painted side-by-side at La Grenouillère"],
  ["Claude Monet", "Camille Pissarro", "exhibited together, Impressionist co-founders"],
  ["Claude Monet", "Edgar Degas", "Impressionist exhibitions"],
  ["Pierre-Auguste Renoir", "Edgar Degas", "Impressionist exhibitions"],
  ["Pierre-Auguste Renoir", "Camille Pissarro", "Impressionist exhibitions"],
  ["Vincent van Gogh", "Paul Gauguin", "lived together in Arles, 1888"],
  ["Vincent van Gogh", "Paul Cézanne", "contemporaries, Post-Impressionists"],
  ["Vincent van Gogh", "Camille Pissarro", "Pissarro mentored van Gogh in Paris"],
  ["Paul Cézanne", "Camille Pissarro", "Pissarro was Cézanne's mentor"],
  ["Paul Cézanne", "Pierre-Auguste Renoir", "contemporaries"],
  ["Édouard Manet", "Edgar Degas", "close friends, frequent correspondents"],
  ["Édouard Manet", "Berthe Morisot", "brother-in-law and painting peers"],
  ["Berthe Morisot", "Claude Monet", "Impressionist group"],
  ["Berthe Morisot", "Edgar Degas", "Impressionist group"],
  ["Henri de Toulouse-Lautrec", "Vincent van Gogh", "Paris, late 1880s"],
  ["Henri de Toulouse-Lautrec", "Paul Gauguin", "Paris contemporaries"],
  ["Georges Seurat", "Paul Signac", "co-developed Pointillism"],
  ["Georges Seurat", "Camille Pissarro", "Pissarro adopted Pointillism briefly"],
  ["Pablo Picasso", "Georges Braque", "co-founders of Cubism"],
  ["Pablo Picasso", "Henri Matisse", "lifelong rivals and friends"],
  ["Henri Matisse", "André Derain", "Fauvism co-founders"],
  ["Wassily Kandinsky", "Franz Marc", "Der Blaue Reiter co-founders"],
  ["Wassily Kandinsky", "Paul Klee", "Bauhaus colleagues"],
  ["Paul Klee", "Franz Marc", "Der Blaue Reiter"],
  ["Paul Klee", "August Macke", "Tunisia trip, 1914"],
  ["Gustav Klimt", "Egon Schiele", "Klimt mentored Schiele in Vienna"],
  ["Gustav Klimt", "Koloman Moser", "Vienna Secession co-founders"],
  ["Egon Schiele", "Oskar Kokoschka", "Vienna Secession"],
  ["Peter Paul Rubens", "Anthony van Dyck", "van Dyck was Rubens's assistant"],
  ["Leonardo da Vinci", "Michelangelo Buonarroti", "rivals in Florence"],
  ["Leonardo da Vinci", "Raphael", "Raphael studied Leonardo's technique"],
  ["Michelangelo Buonarroti", "Raphael", "rivals in Rome"],
  ["Rembrandt van Rijn", "Johannes Vermeer", "Dutch Golden Age peers"],
  ["J. M. W. Turner", "John Constable", "Romantic rivals at the Royal Academy"],
  ["Eugène Delacroix", "Théodore Géricault", "Romantic peers"],
  ["Jean-Auguste-Dominique Ingres", "Eugène Delacroix", "Neoclassical vs Romantic rivals"],
  ["Katsushika Hokusai", "Utagawa Hiroshige", "ukiyo-e masters"],
  ["Utagawa Hiroshige", "Utagawa Kuniyoshi", "Utagawa school"],
  ["Claude Monet", "James McNeill Whistler", "friends and correspondents"],
  ["James McNeill Whistler", "John Singer Sargent", "American expatriates, London"],
  ["John Singer Sargent", "Claude Monet", "Sargent visited Monet at Giverny"],
  ["Mary Cassatt", "Edgar Degas", "Degas invited Cassatt into Impressionists"],
  ["Mary Cassatt", "Camille Pissarro", "Impressionist group"],
  ["Salvador Dalí", "Pablo Picasso", "Spanish contemporaries"],
  ["Salvador Dalí", "Joan Miró", "Spanish Surrealists"],
  ["René Magritte", "Salvador Dalí", "Surrealist peers"],
  ["Marc Chagall", "Pablo Picasso", "Paris contemporaries"],
  ["Vincent van Gogh", "Émile Bernard", "close correspondents"],
  ["Paul Gauguin", "Émile Bernard", "developed Synthetism together"],
  ["Hasui Kawase", "Yoshida Hiroshi", "shin-hanga movement peers"],
  ["John James Audubon", "John Gould", "ornithological illustrators, contemporaries"],
];

// Sidecar values that are actually placeholders, not real measurements. Each
// pair here is shared by a huge chunk of the catalog (>30 artworks) because
// the source hands the same value to every page in a book or collection:
//   - 67.31 × 100.33  Audubon's "double elephant folio" page size (435 plates)
//   - 26 × 36         Haeckel Kunstformen der Natur book page   (100 plates)
//   - 41 × 76         Wikimedia template default seen on ~34 Russian works
// Null these out so the 3D gallery skips them rather than rendering every
// Audubon bird at an identical uniform page rectangle.
const PLACEHOLDER_DIMS = new Set([
  "6731:10033",
  "10033:6731",
  "2600:3600",
  "3600:2600",
  "4100:7600",
  "7600:4100",
]);

function sanitizeRealDimensions(dims) {
  if (!dims) return null;
  const { widthCm, heightCm, source } = dims;

  const sig = `${Math.round(widthCm * 100)}:${Math.round(heightCm * 100)}`;
  if (PLACEHOLDER_DIMS.has(sig)) return null;

  // Google Art Project's `|pretty_dimensions = w997 x h610 cm` format
  // sometimes stores millimetres labelled as centimetres (confirmed on
  // "The Deposition" and others). Real paintings over ~4 m in either
  // dimension are rare and almost always covered by Wikidata, so anything
  // sourced from the wikitext template and exceeding 400 cm is very likely
  // the mm/cm bug. If dividing by 10 gives a plausible painting (both dims
  // 1–300 cm), accept the mm interpretation; otherwise drop the value as
  // unreliable so the room renderer falls back to skipping it.
  if (source === "wikimedia-template" && (widthCm > 400 || heightCm > 400)) {
    const wMm = widthCm / 10;
    const hMm = heightCm / 10;
    if (wMm >= 1 && hMm >= 1 && wMm <= 300 && hMm <= 300) {
      return { widthCm: wMm, heightCm: hMm, source: "wikimedia-template-mm" };
    }
    return null;
  }

  return { widthCm, heightCm, source };
}

async function loadRealDimensions() {
  // Sidecar produced by scripts/fetch-artwork-dimensions.mjs. Optional — if
  // missing, every artwork simply gets realDimensions: null.
  const p = path.join(META, "artwork-dimensions.json");
  if (!existsSync(p)) return new Map();
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  let droppedPlaceholder = 0;
  let mmFixed = 0;
  let droppedUnreliable = 0;
  for (const [id, v] of Object.entries(raw)) {
    if (v == null) continue;
    if (
      typeof v.widthCm !== "number" ||
      typeof v.heightCm !== "number" ||
      typeof v.source !== "string"
    ) {
      continue;
    }
    const sanitized = sanitizeRealDimensions(v);
    if (!sanitized) {
      // Distinguish the two drop reasons for the stats line.
      const sig = `${Math.round(v.widthCm * 100)}:${Math.round(v.heightCm * 100)}`;
      if (PLACEHOLDER_DIMS.has(sig)) droppedPlaceholder++;
      else droppedUnreliable++;
      continue;
    }
    if (sanitized.source === "wikimedia-template-mm") mmFixed++;
    m.set(id, sanitized);
  }
  console.log(
    `[build-data] realDimensions: ${m.size} kept, ${droppedPlaceholder} placeholders dropped, ${mmFixed} mm/cm rescales, ${droppedUnreliable} unreliable dropped`,
  );
  return m;
}

// Curator overrides — manually-written or LLM-generated English
// descriptions keyed by artwork id. Loaded from
// metadata/curator-descriptions.json (optional). Used for entries
// whose Wikimedia source description was missing or non-English, so
// the gallery never has to render a foreign-language paragraph or a
// generated byline when a real description can be served instead.
async function loadCuratorDescriptions() {
  const p = path.join(META, "curator-descriptions.json");
  if (!existsSync(p)) return new Map();
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [id, desc] of Object.entries(raw)) {
    if (typeof desc === "string" && desc.trim()) m.set(id, desc.trim());
  }
  console.log(`[build-data] curator descriptions: ${m.size}`);
  return m;
}

// Provenance generated by `node scripts/fetch-provenance.mjs <folders>`.
// Optional — if the file isn't present, every artwork ends up with
// provenance: null and the UI gracefully omits the structured block.
async function loadProvenance() {
  const p = path.join(META, "provenance.json");
  if (!existsSync(p)) {
    console.log(`[build-data] provenance: skipped (no metadata/provenance.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  let withInfo = 0;
  for (const [fname, prov] of Object.entries(raw)) {
    if (!prov || typeof prov !== "object") continue;
    // Drop entirely empty records (no Wikidata hit AND no source links) —
    // they'd just bloat the artworks.json with `null`-filled objects.
    const hasWikidata = !!prov.wikidataId;
    const hasLinks = Array.isArray(prov.sourceLinks) && prov.sourceLinks.length > 0;
    if (!hasWikidata && !hasLinks) continue;
    m.set(fname, prov);
    withInfo++;
  }
  console.log(`[build-data] provenance entries: ${withInfo}`);
  return m;
}

async function main() {
  assertRequiredAssetsAvailable();

  const [cob, birds, haeckel] = await Promise.all(
    WIKIMEDIA_FOLDERS.map((f) => readFile(path.join(META, `${f}.json`), "utf8").then(JSON.parse)),
  );
  const { artists: artistsDb, byAlias } = await loadArtistsDb();
  const realDimensions = await loadRealDimensions();
  const curatorDescriptions = await loadCuratorDescriptions();
  const provenanceMap = await loadProvenance();

  const artworks = [];
  const artistAggregates = new Map();
  const droppedMissing = { count: 0, samples: [] };

  function pushFromFolder(folderKey, data) {
    for (const [fname, entry] of Object.entries(data.entries)) {
      if (!keepEntry(entry)) continue;

      // Drop entries whose source file isn't present on disk. These come
      // from metadata for files we never downloaded (or that landed under
      // a different filename) — Wikimedia thumbnail URLs (`2560px-…`),
      // renamed locals (`Albrecht_Dürer_-_The_Rhinoceros_(NGA_…).jpg` vs
      // `dürer rhino.jpg`), etc. Including them in artworks.json means
      // every gallery <img> 404s on those tiles.
      const srcExists = existsSync(path.join(ASSETS, folderKey, fname));
      if (!srcExists) {
        droppedMissing.count++;
        if (droppedMissing.samples.length < 5) {
          droppedMissing.samples.push(`${folderKey}/${fname}`);
        }
        continue;
      }

      const normalizedArtistName = normalizeArtistName(entry.artist) ?? null;
      const title = cleanTitle(entry.title, fname, normalizedArtistName);
      const year = extractYear(entry);
      const artistInfo = entry.artist_info ?? matchArtist(normalizedArtistName, byAlias);
      // Prefer the canonical name from the artists DB so casing variants
      // ("Claude monet"), spelling variants ("Rafael" → "Raphael", "Alfons
      // Mucha" → "Alphonse Mucha"), and ordering variants ("Yamamoto Kanae"
      // → "Kanae Yamamoto") collapse onto a single artist page.
      const artistName = artistInfo?.name ?? normalizedArtistName;
      const artistSlug = artistName ? slugify(artistName) : "unknown";
      const id = slugify(`${folderKey}-${fname.replace(/\.[^.]+$/, "")}`).slice(0, 120);

      const dims = dimensionsFor(folderKey, fname);
      const real = realDimensions.get(id) || null;
      const variantWidths = variantWidthsFor(folderKey, fname);
      artworks.push({
        id,
        title,
        artist: artistName,
        artistSlug,
        year,
        dateCreated: stripQuickStatements(entry.date_created) || null,
        description: curatorDescriptions.get(id) ?? firstLineDescription(entry.description),
        folder: folderKey,
        objectKey: `${folderKey}/${fname}`,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        realDimensions: real,
        variantWidths: variantWidths.length > 0 ? variantWidths : null,
        fileUrl: entry.source.file_url,
        commonsUrl: entry.source.url,
        credit: cleanCredit(entry.source.credit),
        license: entry.copyright.license_short || "Public domain",
        movement: artistInfo?.movement || null,
        nationality: artistInfo?.nationality || null,
        provenance: provenanceMap.get(fname) ?? null,
      });

      if (artistName) {
        if (!artistAggregates.has(artistSlug)) {
          artistAggregates.set(artistSlug, {
            slug: artistSlug,
            name: artistName,
            born: artistInfo?.born ?? null,
            died: artistInfo?.died ?? null,
            nationality: artistInfo?.nationality ?? null,
            movement: artistInfo?.movement ?? null,
            count: 0,
            minYear: null,
            maxYear: null,
            coverFileUrl: null,
            coverObjectKey: null,
            coverTitle: null,
            coverVariantWidths: null,
          });
        }
        const agg = artistAggregates.get(artistSlug);
        agg.count += 1;
        if (year != null) {
          if (agg.minYear == null || year < agg.minYear) agg.minYear = year;
          if (agg.maxYear == null || year > agg.maxYear) agg.maxYear = year;
        }
        if (!agg.coverFileUrl) {
          agg.coverFileUrl = entry.source.file_url;
          agg.coverObjectKey = `${folderKey}/${fname}`;
          agg.coverTitle = title;
          agg.coverVariantWidths = variantWidths.length > 0 ? variantWidths : null;
        }
      }
    }
  }

  pushFromFolder("collection-of-beauty", cob);
  pushFromFolder("audubon-birds", birds);
  pushFromFolder("kunstformen-images", haeckel);

  if (artworks.length === 0) {
    throw new Error(
      `[build-data] Refusing to write an empty catalog. ` +
        `${droppedMissing.count} metadata entries had no matching source file in assets/.`,
    );
  }

  if (droppedMissing.count > 0) {
    const sampleStr = droppedMissing.samples.join(", ");
    console.log(
      `[build-data] dropped ${droppedMissing.count} entries with no source file on disk (e.g. ${sampleStr}${droppedMissing.count > droppedMissing.samples.length ? ", …" : ""})`,
    );
  }

  artworks.sort((a, b) => {
    const ay = a.year ?? 99999;
    const by = b.year ?? 99999;
    if (ay !== by) return ay - by;
    return (a.title || "").localeCompare(b.title || "");
  });

  const artists = Array.from(artistAggregates.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  const movements = Array.from(new Set(artists.map((a) => a.movement).filter(Boolean))).sort();

  const knownArtistByName = new Map(artists.map((a) => [a.name, a]));
  const artistSlugByName = new Map(artists.map((a) => [a.name, a.slug]));

  const edges = [];
  for (const [a, b, label] of KNOWN_CONNECTIONS) {
    const aa = knownArtistByName.get(a);
    const bb = knownArtistByName.get(b);
    if (!aa || !bb) continue;
    edges.push({
      source: aa.slug,
      target: bb.slug,
      label,
      kind: "known",
    });
  }

  const movementGroups = buildMovementGroups(artists);
  const existingPairs = new Set(edges.map((e) => [e.source, e.target].sort().join("|")));
  for (const [movement, members] of movementGroups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const x = members[i];
        const y = members[j];
        if (overlapYears(x, y) < 5) continue;
        const key = [x.slug, y.slug].sort().join("|");
        if (existingPairs.has(key)) continue;
        existingPairs.add(key);
        edges.push({
          source: x.slug,
          target: y.slug,
          label: `shared movement: ${movement}`,
          kind: "movement",
        });
      }
    }
  }

  const summary = {
    totalArtworks: artworks.length,
    totalArtists: artists.length,
    totalMovements: movements.length,
    totalConnections: edges.length,
    yearRange: {
      min: artworks.reduce(
        (m, a) => (a.year != null && (m == null || a.year < m) ? a.year : m),
        null,
      ),
      max: artworks.reduce(
        (m, a) => (a.year != null && (m == null || a.year > m) ? a.year : m),
        null,
      ),
    },
  };

  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "artworks.json"), JSON.stringify(artworks));
  await writeFile(path.join(OUT, "artists.json"), JSON.stringify(artists));
  await writeFile(path.join(OUT, "movements.json"), JSON.stringify(movements));
  await writeFile(path.join(OUT, "connections.json"), JSON.stringify(edges));
  await writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("[build-data]", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
