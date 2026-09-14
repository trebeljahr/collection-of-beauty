import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import sharp from "sharp";
import { colorProfileFromHistogram } from "../src/lib/color-buckets.mjs";
import { loadArtistsDb, matchArtist } from "./lib/artist-alias.mjs";
import { artworkId, ID_MAX_LENGTH, slugify } from "./lib/artwork-id.mjs";
import { SOURCE_FOLDERS } from "./lib/source-folders.mjs";
import { loadTakedowns } from "./lib/takedowns.mjs";

// sharp's async work runs on the libuv threadpool, which defaults to 4
// threads — the ceiling on how many images we can probe at once. Node reads
// this the first time the pool is used, so it has to be set before any async
// fs call. Paired with sharp.concurrency(1): libvips otherwise spawns a
// thread per core *per image*, and on the tiny 256px variants we probe that
// oversubscription costs more than it buys (measured ~2x slower than one
// libvips thread per image with our own pool on top).
const PROBE_CONCURRENCY = Math.max(2, os.cpus().length);
process.env.UV_THREADPOOL_SIZE ||= String(PROBE_CONCURRENCY);
sharp.concurrency(1);

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
// (emitted by `pnpm assets:shrink`). Returns the sorted list of widths for
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

// Apply EXIF orientation to raw pixel dimensions. Orientations 5-8
// swap the axes (the image is shown rotated 90°/270° from the way the
// pixels are encoded). Browsers honour EXIF via the default
// `image-orientation: from-image` CSS, and `pnpm assets:shrink` bakes
// the rotation into every variant — so the metadata we ship for the
// row-layout solver must reflect the rotated geometry too, not the
// raw sensor dimensions. Without this, EXIF-rotated portraits (e.g.
// Rubens' "Young man in armor" — raw 1632×1262, orientation 6 → shown
// 1262×1632 portrait) get packed by react-photo-album as landscape
// tiles, blow out the row height, and leave a huge empty gap below.
function applyExifOrientation(width, height, orientation) {
  if (orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8) {
    return { width: height, height: width };
  }
  return { width, height };
}

async function dimensionsFor(folderKey, filename) {
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
      const { width, height, orientation } = imageSize(slice);
      if (width && height) result = applyExifOrientation(width, height, orientation);
    } catch {
      // image-size needs the SOF marker within the probe; some JPEGs
      // bury it past 64 KB behind large EXIF/thumbnail blocks. Fall
      // through to the sharp path below.
    }
    if (!result) {
      // Sharp streams the file header rather than buffering the whole
      // image, so it's safe on the 16 MB plates that motivated the 64 KB
      // probe in the first place.
      //
      // limitInputPixels: false because a handful of plates are past sharp's
      // default 268 MP ceiling, and it rejects those at metadata() time even
      // though reading a header decodes nothing. That rejection is what left
      // the 154 MB Boilly plate with null width/height in the catalogue.
      try {
        const meta = await sharp(file, { limitInputPixels: false }).metadata();
        if (meta.width && meta.height) {
          result = applyExifOrientation(meta.width, meta.height, meta.orientation);
        } else {
          console.log(`[build-data] warning: no dimensions in header for ${key}`);
        }
      } catch (err) {
        console.log(`[build-data] warning: dimension probe failed for ${key} (${err.message})`);
      }
    }
  }
  dimensionCache.set(key, result);
  return result;
}

// Compute a single dominant RGB hex (e.g. "#a87b4f") per artwork. Used
// as a CSS background-color underneath each <img> so slow mobile
// connections show a tinted block in the correct aspect ratio while the
// AVIF variant downloads, instead of an empty white tile that pops once
// the bytes arrive.
//
// We prefer the smallest pre-built variant (typically 256.avif, ~10 KB)
// over the original plate (often 10-30 MB); decoding the variant is
// orders of magnitude faster and sharp().stats() is already an average
// over all pixels, so the dominant color is materially the same.
// Smallest readable pixel source for an artwork: the narrowest pre-built
// variant (typically 256.avif, ~10 KB), else the original plate. Shared by
// the average-colour and colour-bucket passes so they always agree on
// which bytes they are describing.
const sourceCache = new Map();
function smallestSourceFor(folderKey, filename) {
  const key = `${folderKey}/${filename}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  let source = null;
  const basename = filename.replace(/\.[^.]+$/, "");
  const variantDir = path.join(ASSETS_WEB, folderKey, basename);
  if (existsSync(variantDir)) {
    try {
      let smallestWidth = Infinity;
      let smallestFile = null;
      for (const f of readdirSync(variantDir)) {
        const m = f.match(/^(\d+)\.(avif|webp)$/i);
        if (!m) continue;
        const w = Number.parseInt(m[1], 10);
        if (w < smallestWidth) {
          smallestWidth = w;
          smallestFile = f;
        }
      }
      if (smallestFile) source = path.join(variantDir, smallestFile);
    } catch {
      // fall through to original
    }
  }
  if (!source) {
    const file = path.join(ASSETS, folderKey, filename);
    if (existsSync(file)) source = file;
  }
  sourceCache.set(key, source);
  return source;
}

const colorCache = new Map();
async function dominantColorFor(folderKey, filename) {
  const key = `${folderKey}/${filename}`;
  if (colorCache.has(key)) return colorCache.get(key);
  let result = null;
  const source = smallestSourceFor(folderKey, filename);
  if (source) {
    try {
      const stats = await sharp(source).stats();
      const channels = stats.channels.slice(0, 3);
      if (channels.length === 3) {
        const hex = channels
          .map((c) =>
            Math.max(0, Math.min(255, Math.round(c.mean)))
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
        result = `#${hex}`;
      }
    } catch {
      // leave null
    }
  }
  colorCache.set(key, result);
  return result;
}

// Probing ~4,500 images with sharp is the single slowest thing this script
// does — a cold run spends over two minutes decoding pixels, and `pnpm dev`
// blocks on all of it before Next even starts. Almost none of that work
// changes between runs: the assets are static, so a file's dimensions,
// dominant color and colour families are a pure function of its bytes.
// Persist the results keyed
// by (mtime, size) of the original plus the mtime of its variant directory,
// and a warm run reuses everything and finishes in seconds.
//
// The cache lives under metadata/.cache/ (already gitignored, alongside the
// Wikimedia response cache) rather than src/data/, which is committed.
// v3 added colorStrength, which no v2 entry carries — the amounts only
// exist by re-reading pixels, so the bump forces one full re-probe.
//
// Only probes that produced dimensions are cached. A failure is an event to
// retry and report, not a fact about the bytes, and caching one made the
// resulting null width/height in artworks.json permanent and invisible.
const PROBE_CACHE_VERSION = 3;
const PROBE_CACHE_FILE = path.join(META, ".cache", "image-probe.json");

// Signature of everything the probe results depend on. Returns null when the
// original is missing or unreadable, which forces a live probe (and lets the
// normal missing-file handling downstream drop the entry).
function probeSignature(folderKey, filename) {
  const basename = filename.replace(/\.[^.]+$/, "");
  let sig;
  try {
    const st = statSync(path.join(ASSETS, folderKey, filename));
    sig = `${Math.round(st.mtimeMs)}:${st.size}`;
  } catch {
    return null;
  }
  try {
    // The directory mtime moves whenever a variant is added or removed, which
    // is exactly when variantWidths and the dominant-color source can change.
    // `pnpm assets:shrink` writes whole directories, so re-encoding in place
    // isn't a case we hit.
    const vst = statSync(path.join(ASSETS_WEB, folderKey, basename));
    sig += `:${Math.round(vst.mtimeMs)}`;
  } catch {
    sig += ":none";
  }
  return sig;
}

async function loadProbeCache() {
  try {
    const raw = JSON.parse(await readFile(PROBE_CACHE_FILE, "utf8"));
    if (raw.version !== PROBE_CACHE_VERSION) return {};
    const entries = raw.entries ?? {};
    // Only successful probes are written (see prefillImageProbes), but v3
    // caches predating that rule can hold an entry whose dimension probe
    // threw. Dropping them here re-probes exactly those files instead of
    // forcing a full 4,500-image re-probe with a version bump.
    const usable = {};
    for (const [key, entry] of Object.entries(entries)) {
      if (entry?.width && entry?.height) usable[key] = entry;
    }
    return usable;
  } catch {
    return {};
  }
}

async function saveProbeCache(entries) {
  try {
    await mkdir(path.dirname(PROBE_CACHE_FILE), { recursive: true });
    await writeFile(PROBE_CACHE_FILE, JSON.stringify({ version: PROBE_CACHE_VERSION, entries }));
  } catch (err) {
    // A cache we can't write is a slow build, not a broken one.
    console.log(`[build-data] warning: could not write probe cache (${err.message})`);
  }
}

// Run `worker` over `items` with bounded concurrency. sharp releases the
// event loop while libvips decodes, so overlapping calls actually use the
// other cores instead of idling one at a time.
async function mapWithConcurrency(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

// Emit progress at most once a second so a long cold probe never looks hung.
// On a TTY the line rewrites itself in place; piped to a file it appends.
function makeProgressReporter(label, total) {
  const tty = process.stdout.isTTY;
  const started = Date.now();
  let last = 0;
  const render = (done, final) => {
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const line = `[build-data] ${label} ${done}/${total} (${secs}s)`;
    process.stdout.write(tty ? `\r${line}${final ? "\n" : ""}` : `${line}\n`);
  };
  return {
    tick(done) {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      render(done, false);
    },
    done(count) {
      render(count, true);
    },
  };
}

// Populate dimensionCache / colorCache / profileCache / variantsCache for every artwork we
// are about to emit, reusing cached probe results where the files haven't
// moved and probing the rest in parallel. After this returns, the per-entry
// `await dimensionsFor(...)` calls in the main loop are pure cache hits.
async function prefillImageProbes(work) {
  const cached = await loadProbeCache();
  const fresh = {};
  const stale = [];

  for (const item of work) {
    const key = `${item.folderKey}/${item.fname}`;
    const sig = probeSignature(item.folderKey, item.fname);
    const hit = sig && cached[key]?.sig === sig ? cached[key] : null;
    if (!hit) {
      stale.push({ ...item, key, sig });
      continue;
    }
    fresh[key] = hit;
    dimensionCache.set(key, { width: hit.width, height: hit.height });
    colorCache.set(key, hit.dominantColor ?? null);
    profileCache.set(
      key,
      hit.colorBuckets ? { buckets: hit.colorBuckets, strength: hit.colorStrength ?? {} } : null,
    );
    variantsCache.set(key, hit.variantWidths ?? []);
  }

  const reused = work.length - stale.length;
  console.log(
    `[build-data] image probes: ${reused}/${work.length} cached, ${stale.length} to compute`,
  );

  if (stale.length > 0) {
    const progress = makeProgressReporter("probing images", stale.length);
    let done = 0;
    const failed = [];
    await mapWithConcurrency(stale, PROBE_CONCURRENCY, async (item) => {
      const dims = await dimensionsFor(item.folderKey, item.fname);
      const dominantColor = await dominantColorFor(item.folderKey, item.fname);
      const profile = await colorProfileFor(item.folderKey, item.fname);
      const variantWidths = variantWidthsFor(item.folderKey, item.fname);
      // Cache successes only. A null dimension probe here means the file was
      // there (probeSignature already returns null for a missing original) and
      // sharp could not read it — caching that would pin the failure forever,
      // silently, because the signature still matches on the next run.
      if (item.sig && dims) {
        fresh[item.key] = {
          sig: item.sig,
          width: dims.width,
          height: dims.height,
          dominantColor,
          colorBuckets: profile?.buckets ?? null,
          colorStrength: profile?.strength ?? null,
          variantWidths,
        };
      } else if (item.sig) {
        // sig is non-null, so the original is on disk — this is a real probe
        // failure, not the missing-file case the main loop already drops.
        failed.push(path.join(ASSETS, item.folderKey, item.fname));
      }
      done++;
      progress.tick(done);
    });
    progress.done(done);
    if (failed.length > 0) {
      console.log(
        `[build-data] warning: ${failed.length} image probe(s) failed and were NOT cached (they will be retried on the next run):`,
      );
      for (const file of failed) console.log(`[build-data]   ${path.relative(ROOT, file)}`);
    }
  }

  await saveProbeCache(fresh);
}

// Colour families for the browse-by-colour filter. Unlike dominantColor
// (a single whole-image average, kept as-is for the tile placeholder
// tint), this reads the actual distribution of pixels: averaging a blue
// sky against a sandy shore lands on a muddy warm grey, which is useless
// for "show me the blues". See src/lib/color-buckets.mjs for the scoring.
//
// The image is decoded at 64px on the long edge and quantized to 5 bits
// per channel. That's ~4,000 pixels collapsing into at most a few hundred
// histogram bins — far more than enough to characterise a palette, and
// cheap enough to run across the whole corpus.
const COLOR_SAMPLE_PX = 64;

// Strengths are baked at 3 decimals. The value is a fraction of the whole
// image, so 0.001 is one pixel in a thousand — finer than the 64px decode
// can resolve anyway, and full float64 would add ~15 bytes per family to
// every row of artworks.json for digits nothing reads.
const STRENGTH_PRECISION = 1000;

const profileCache = new Map();
async function colorProfileFor(folderKey, filename) {
  const key = `${folderKey}/${filename}`;
  if (profileCache.has(key)) return profileCache.get(key);
  let result = null;
  const source = smallestSourceFor(folderKey, filename);
  if (source) {
    try {
      const { data, info } = await sharp(source)
        .resize(COLOR_SAMPLE_PX, COLOR_SAMPLE_PX, { fit: "inside" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (info.channels >= 3) {
        const stride = info.channels;
        const pixels = info.width * info.height;
        const bins = new Map();
        for (let i = 0; i < pixels; i++) {
          const at = i * stride;
          const bin = ((data[at] >> 3) << 10) | ((data[at + 1] >> 3) << 5) | (data[at + 2] >> 3);
          bins.set(bin, (bins.get(bin) ?? 0) + 1);
        }
        // Re-expand each bin to the centre of the 8-value range it covers
        // so quantization doesn't bias every channel downwards.
        const entries = [];
        for (const [bin, count] of bins) {
          entries.push({
            r: (((bin >> 10) & 31) << 3) | 4,
            g: (((bin >> 5) & 31) << 3) | 4,
            b: ((bin & 31) << 3) | 4,
            count,
          });
        }
        const profile = colorProfileFromHistogram(entries);
        if (profile.buckets.length > 0) {
          const strength = {};
          for (const [id, value] of Object.entries(profile.strength)) {
            strength[id] = Math.round(value * STRENGTH_PRECISION) / STRENGTH_PRECISION;
          }
          result = { buckets: profile.buckets, strength };
        }
      }
    } catch {
      // leave null — the runtime treats null as "not classified yet",
      // the same contract variantWidths uses.
    }
  }
  profileCache.set(key, result);
  return result;
}

function assertRequiredAssetsAvailable() {
  if (!existsSync(ASSETS)) {
    throw new Error(
      `[build-data] Missing ${path.relative(ROOT, ASSETS)}/. ` +
        "Download or mount source assets before generating src/data.",
    );
  }

  const missingFolders = SOURCE_FOLDERS.filter((folder) => !existsSync(path.join(ASSETS, folder)));
  if (missingFolders.length > 0) {
    throw new Error(
      `[build-data] Missing asset folder(s): ${missingFolders
        .map((folder) => path.join("assets", folder))
        .join(", ")}. Run the download scripts or restore the asset archive before building.`,
    );
  }
}

// Wikidata language-tagged label fragments that leak through the Commons
// alt-title extractor: "Alternative title: …", "Hungarian: A késélező …",
// etc. Strip from the first occurrence to end-of-string.
const QS_LANG_LABELS = [
  "Hungarian",
  "Russian",
  "German",
  "French",
  "Italian",
  "Dutch",
  "Spanish",
  "Japanese",
  "English",
  "Polish",
  "Czech",
  "Portuguese",
  "Romanian",
  "Greek",
  "Latin",
  "Norwegian",
  "Danish",
  "Swedish",
  "Korean",
  "Chinese",
  "Arabic",
  "Hebrew",
  "Turkish",
  "Finnish",
  "Ukrainian",
  "Catalan",
];
const QS_LABEL_RX = new RegExp(
  `\\s+(?:Alternative\\s+title|${QS_LANG_LABELS.join("|")}):\\s.*$`,
  "i",
);

function stripQuickStatements(input) {
  if (!input) return input;
  return input
    .replace(/\s*(title|label)\s+QS:[^,]+(,[^,]+)*/g, "")
    .replace(/\s*date\s+QS:[^,\s]+(,[^,\s]+)*/g, "")
    .replace(QS_LABEL_RX, "")
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
    if (/[^\s\d.,;:!?'"()&-]/u.test(ch)) letters++;
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

// Stock boilerplate fragments commonly scraped along with real
// provenance. Match per whole-string OR per item in a numbered
// citation list ("1. X 2. Y"). Anchor with ^ / $ so a real citation
// that merely contains one of these phrases isn't dropped wholesale.
const BOILERPLATE_FRAGMENTS = [
  /^the yorck project \(?2002\)?.*meisterwerke der malerei/i,
  /^this file was donated to wikimedia commons as part of a project by/i,
  /^unknown source(?:\s+unknown source)?(?:[,\s]+scanned by uploader)?$/i,
  /^own work\b(?:\s*,.*|\s+current photo taken by user\b.*)?$/i,
  /^self[-\s]?scanned$/i,
  /^copied from an art ?book$/i,
  /^repro from art ?book$/i,
  /^scan of painting$/i,
  /^see below$/i,
  /^catalog photo$/i,
  /^gallery link$/i,
  /^art database$/i,
  /^google cultural institute$/i,
  /^[-\w]+ at google cultural institute\b\s*,?\s*(?:(?:zoom level\s*)?(?:maximum|scaled down(?:\s+from\s+[\w-]+)?|scaled down maximum)|maximum\s+zoom\s+level)$/i,
  /^google art project(?::\s*(?:home\s*[-\u2013]\s*)?pic(?:\s+maximum resolution\.?)?(?:\s+colou?rs edited by uploader)?)?$/i,
  /^google arts? (?:&|and) culture(?:\s*[\u2013\u2014-]\s*[-\w]+|:\s*home\s*[-\u2013]\s*pic(?:\s+maximum resolution\.?)?(?:\s+\(appears to have been taken down\))?)?$/i,
  /^\[\s*dead link\s*\]?$/i,
  /^(?:and|und)\s+\[\d+\]?$/i,
  /^aufgerufen\b/i,
  /^one or more third parties have made copyright claims/i,
  /^print scan(?:\s+original at library of congress)?$/i,
  /^public domain$/i,
  /^this tag does not indicate/i,
  /^commons:licensing$/i,
  /^a normal copyright tag/i,
  /^this image is available from/i,
];

function isBoilerplateFragment(s) {
  const t = String(s)
    .trim()
    .replace(/[.,;:\s\][]+$/g, "")
    .replace(/^\[\d+\]\s*/, "")
    .trim();
  if (!t) return true;
  return BOILERPLATE_FRAGMENTS.some((rx) => rx.test(t));
}

// LoC `jpd.NNNNN` digital IDs appear in the boilerplate "This image is
// available from the United States Library of Congress 's Prints and
// Photographs division under the digital ID jpd.01320…" — the prose
// is noise, but the ID resolves to a canonical LoC page worth keeping.
function extractLocUrl(text) {
  const m = /\b(jpd|cph|ppmsca|pga|highsm|ds|fsa|matpc)\.\d+[a-z0-9]*\b/i.exec(text);
  if (!m) return null;
  return `https://www.loc.gov/pictures/item/${m[0].toLowerCase()}/`;
}

// Numbered citation lists ("1. Source A . 2. Source B"). Returns the
// per-item array or null when the string doesn't look like a list.
// Accepts out-of-order numbering ("2. … 1. …") and single-item lists
// where the leading "1." is stray enumeration on its own.
function splitCitationList(s) {
  const marker = /\d+(?:\.\/\d+)?[.:]?/;
  const nextMarker = /\d+(?:\.\/\d+)?[.:]/;
  const firstMarker = new RegExp(`^\\s*${marker.source}\\s+\\S`);
  if (!firstMarker.test(s)) return null;
  const stripped = s.replace(new RegExp(`^\\s*${marker.source}\\s+`), "");
  const parts = stripped
    .split(new RegExp(`\\s+${nextMarker.source}\\s+`))
    .map((p) => p.trim().replace(/[.,;\s]+$/g, ""))
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

// Catch-all sanity check: too short, bare URL, or matches one of the
// known boilerplate phrases. Kept narrow — the per-fragment list above
// does most of the work.
function looksLikeBoilerplate(text) {
  if (!text) return true;
  const t = String(text).trim();
  if (t.length < 10) return true;
  if (/^https?:\/\/\S+$/.test(t)) return true;
  if (isBoilerplateFragment(t)) return true;
  // Bare "digital ID xyz" with no surrounding prose.
  if (/digital id/i.test(t) && t.length < 50) return true;
  return false;
}

// `entry.source.credit` is the Wikimedia uploader's free-text entry,
// often "Own work" (the uploader photographed the painting themselves
// — true but uninformative for attribution) or a museum/auction
// reference. Drop the boilerplate so the artwork detail page doesn't
// render attribution noise.
export function cleanCredit(raw) {
  if (!raw) return null;
  let c = String(raw).trim();
  if (!c) return null;
  if (/^own\s*work$/i.test(c)) return null;

  // Strip trailing Yorck Project DVD-ROM clauses ("…; Former version:
  // The Yorck Project (2002)…"). The DVD scan is always boilerplate;
  // leaving it tacked onto a legitimate museum citation just adds noise.
  c = c.replace(/[\s.;,]+(?:former version\s*:?\s*)?the yorck project\b[\s\S]*$/i, "").trim();
  if (!c) return null;

  // Library of Congress license boilerplate — promote the digital ID
  // to a canonical LoC URL when present, otherwise drop.
  if (/this image is available from the united states library of congress/i.test(c)) {
    return extractLocUrl(c);
  }

  // Numbered citation list — drop boilerplate items, keep real ones.
  const list = splitCitationList(c);
  if (list) {
    const kept = list.filter((item) => !isBoilerplateFragment(item));
    if (kept.length === 0) return null;
    c = kept.join("; ");
  }

  if (isTransferTrail(c)) return null;
  if (looksLikeBoilerplate(c)) return null;
  return c;
}

// Wiki-transfer / uploader trails ("Originally from en.wikipedia…",
// "Transferred from de.wikipedia to Commons by…", "Own work Gleb
// Simonov", "posted to Flickr as … by freeparking"). Pure upload
// provenance — says nothing about the artwork. A museum / auction
// keyword anywhere in the string vetoes the drop so credits like
// "Flickr The San Diego Museum of Art collection" or
// "flickr.com; Sotheby's London, 19 June 2007, lot 7" survive.
const TRANSFER_TRAIL_PATTERNS = [
  /^originally (?:from|uploaded|posted)\b/i,
  /^original uploader\b/i,
  /^transferr?ed from\b/i,
  /^uploaded (?:to|from)\b/i,
  /^taken from\b/i,
  /^own (?:work|photo(?:graph)?)\b/i,
  /^digital photo by\b/i,
  /^scan(?:ned)? by\b/i,
  /^posted to flickr\b/i,
  /^flickr\s*(?:\[\d+\]\s*)?$/i,
  /found automatically by user:picasa review bot/i,
  /^uploaded from the wikipedia loves art photo pool/i,
];
const TRANSFER_TRAIL_VETO = /museum|institut|sotheby|christie|auktion|auction|academy of art/i;

function isTransferTrail(text) {
  const t = String(text).trim();
  if (TRANSFER_TRAIL_VETO.test(t)) return false;
  return TRANSFER_TRAIL_PATTERNS.some((rx) => rx.test(t));
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
  let cleaned = stripQuickStatements(first).trim();
  // Only peel paired wrapping quotes — `"Title"` → `Title`. Skip if the
  // pair is unbalanced (one outer quote and one inside) so we don't leave
  // a dangling `"Steen` after dropping the trailing `"` of `Castle "Steen"`.
  while (
    cleaned.length > 1 &&
    /^["']/.test(cleaned) &&
    /["']$/.test(cleaned) &&
    cleaned[0] === cleaned[cleaned.length - 1] &&
    (cleaned.match(/["']/g) || []).length % 2 === 0
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Solo trailing quote after a QS-label strip ("Nevermore\"") — peel it.
  if (/["']$/.test(cleaned) && (cleaned.match(/["']/g) || []).length === 1) {
    cleaned = cleaned.slice(0, -1).trim();
  }

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
  if (cleaned.endsWith(".") && !cleaned.endsWith("..") && !TRAILING_ABBREV_RX.test(cleaned)) {
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

// Tokens that carry no attribution on their own, plus the subset that
// actively asserts "we don't know". Mirrors `isPlaceholderArtistName` in
// src/lib/artist-name.ts, which is what the corpus test asserts against.
const PLACEHOLDER_ARTIST_TOKENS = new Set([
  "unknown",
  "anonymous",
  "unidentified",
  "author",
  "artist",
  "painter",
  "photographer",
  "maker",
  "creator",
  "engraver",
  "printmaker",
  "draughtsman",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);
const PLACEHOLDER_ARTIST_NEGATIONS = new Set([
  "unknown",
  "anonymous",
  "unidentified",
  "none",
  "n/a",
  "na",
]);
// Commons editors sometimes leave an instruction in the Artist field
// ("see filename or category") instead of a name.
const ARTIST_META_INSTRUCTION =
  /^see\s+(the\s+)?(filename|file\s*name|category|categories|description|source|below|above)\b/i;

function isPlaceholderArtist(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) return true;
  if (ARTIST_META_INSTRUCTION.test(trimmed)) return true;
  const tokens = trimmed
    .toLowerCase()
    .replace(/[.,;:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  if (!tokens.every((t) => PLACEHOLDER_ARTIST_TOKENS.has(t))) return false;
  if (tokens.some((t) => PLACEHOLDER_ARTIST_NEGATIONS.has(t))) return true;
  // Bare repeated role words ("author author") are what's left once the
  // role-word strip below has removed the "Unknown".
  return tokens.length > 1 && new Set(tokens).size < tokens.length;
}

function normalizeArtistName(raw) {
  if (!raw) return null;
  // "Unknown author/artist/photographer" placeholders are no information at
  // all; render as null so the artist field stays blank rather than echoing
  // the placeholder. Checked token-wise rather than with a backreference:
  // Commons repeats the whole phrase ("Unknown author Unknown author"), which
  // the old `(\s+\1)?` form missed — the later role-word strip then left
  // "author author" standing as an artist name, and it got its own page.
  if (isPlaceholderArtist(raw)) return null;
  // Wikimedia free-text Artist sometimes appends biographical and publisher
  // tails like "Utagawa Kuniyoshi; Utagawa Kuniyoshi died 1861; Iseya Rihei"
  // — keep just the maker.
  let s = raw.includes(";") ? raw.split(";")[0] : raw;
  s = stripQuickStatements(s);
  // Wiki-link prefix from Commons free-text: "w:Albert Gleizes" → "Albert
  // Gleizes". Same for the explicit ":w:" form.
  s = s.replace(/^\s*:?w:\s*/i, "");
  s = s.replace(/\s*\([^)]*\)/g, "");

  // Trailing Google Art Project / Met / Wikipedia boilerplate.
  s = s.replace(/\bDetails on Google Art Project\b.*$/i, "");
  // Biographical tails appended by Wikidata/Wikimedia free-text artist
  // strings: "Hovhannes Aivazovsky – painter Born in Rossiiskaya imperiya,
  // Feodosia. Died in ..." — strip from the first "Born in" / "Died in"
  // / em-dash-prefixed biographical fragment onward.
  s = s.replace(/\s*[–-]\s*(painter|sculptor|artist|engraver|printmaker|creator)\b.*$/i, "");
  s = s.replace(/\s+(Born|Died)\s+(in|at)\b.*$/i, "");
  // Trailing free-form date ranges left over from "(1832–1904) Details ...".
  s = s.replace(/[,\-–]?\s*\b1[5-9]\d{2}\s*[-–/]\s*1[5-9]\d{2}\b.*$/, "");
  // "Lastname, Firstname" → "Firstname Lastname" when the right-hand side is
  // just one or two given-name tokens (no nationality, no role).
  const flip = s.match(
    /^([A-ZÀ-ÖØ-Þ][\p{L}'’-]+)\s*,\s*([A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[a-zà-öø-þ][\p{L}'’-]+)?(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+)?)\s*$/u,
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
  ["Claude Monet", "Édouard Manet", "close friends; painted together at Argenteuil, 1874"],
  ["Claude Monet", "Pierre-Auguste Renoir", "painted side-by-side at La Grenouillère"],
  ["Claude Monet", "Camille Pissarro", "exhibited together, Impressionist co-founders"],
  ["Claude Monet", "Edgar Degas", "Impressionist exhibitions"],
  ["Pierre-Auguste Renoir", "Edgar Degas", "Impressionist exhibitions"],
  ["Pierre-Auguste Renoir", "Camille Pissarro", "Impressionist exhibitions"],
  ["Vincent van Gogh", "Paul Gauguin", "lived together in Arles, 1888"],
  ["Vincent van Gogh", "Camille Pissarro", "Pissarro mentored van Gogh in Paris"],
  ["Paul Cézanne", "Camille Pissarro", "Pissarro was Cézanne's mentor"],
  [
    "Paul Cézanne",
    "Pierre-Auguste Renoir",
    "friends; Renoir painted with Cézanne at L'Estaque and Aix",
  ],
  ["Édouard Manet", "Edgar Degas", "close friends and rivals; met at the Louvre, 1862"],
  ["Édouard Manet", "Berthe Morisot", "brother-in-law and painting peers"],
  ["Berthe Morisot", "Claude Monet", "Impressionist group"],
  ["Berthe Morisot", "Edgar Degas", "Impressionist group"],
  [
    "Henri de Toulouse-Lautrec",
    "Vincent van Gogh",
    "friends from Cormon's atelier; Lautrec portrayed van Gogh, 1887",
  ],
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
  ["Peter Paul Rubens", "Anthony van Dyck", "van Dyck was Rubens's assistant"],
  ["Leonardo da Vinci", "Michelangelo Buonarroti", "rivals in Florence"],
  ["Leonardo da Vinci", "Raphael", "Raphael studied Leonardo's technique"],
  ["Michelangelo Buonarroti", "Raphael", "rivals in Rome"],
  ["J. M. W. Turner", "John Constable", "Romantic rivals at the Royal Academy"],
  [
    "Eugène Delacroix",
    "Théodore Géricault",
    "friends from Guérin's studio; Delacroix posed for the Raft of the Medusa",
  ],
  ["Jean-Auguste-Dominique Ingres", "Eugène Delacroix", "Neoclassical vs Romantic rivals"],
  ["Utagawa Hiroshige", "Utagawa Kuniyoshi", "Utagawa school"],
  ["Claude Monet", "James McNeill Whistler", "friends and correspondents"],
  [
    "James McNeill Whistler",
    "John Singer Sargent",
    "London acquaintances; Sargent championed Whistler's work",
  ],
  ["John Singer Sargent", "Claude Monet", "Sargent visited Monet at Giverny"],
  ["Mary Cassatt", "Edgar Degas", "Degas invited Cassatt into Impressionists"],
  ["Mary Cassatt", "Camille Pissarro", "Impressionist group"],
  ["Salvador Dalí", "Pablo Picasso", "Dalí visited Picasso in Paris, 1926"],
  ["Salvador Dalí", "Joan Miró", "Spanish Surrealists"],
  ["René Magritte", "Salvador Dalí", "Surrealist peers"],
  ["Marc Chagall", "Pablo Picasso", "friends turned rivals on the postwar Côte d'Azur"],
  ["Vincent van Gogh", "Émile Bernard", "close correspondents"],
  ["Paul Gauguin", "Émile Bernard", "developed Synthetism together"],
];

// Sidecar values that are actually junk placeholders, not real measurements:
//   - 41 × 76  Wikimedia template default seen on ~34 unrelated Russian works
// Null these out so the 3D gallery skips them.
//
// Uniform per-book page sizes (Audubon's double-elephant folio 67.31 × 100.33,
// Haeckel's Kunstformen page 26 × 36, Redouté's Liliacées sheet 35 × 52.2) are
// NOT placeholders — they are the real, citable size of every plate in those
// series. They used to be nulled here to avoid rendering each plate as an
// identical rectangle, but the 3D gallery now derives a painting's aspect from
// its texture pixels (see painting.tsx), so a uniform real size only drives the
// physical scale, size-band and the displayed "w × h cm" label — all of which
// we want correct. So they stay.
const PLACEHOLDER_DIMS = new Set(["4100:7600", "7600:4100"]);

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
    // `{ error: true }` marks a lookup that failed rather than an answer —
    // fetch-artwork-dimensions.mjs retries those. Treat it as absent here.
    if (v.error === true) continue;
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

// English-title overrides for foreign-script or romaji-stub titles.
// Keyed by `<folder>/<filename>` (matches the objectKey emitted below).
// Optional — when the file isn't present, every artwork ends up with
// `englishTitle: null` and the UI falls back to the cleaned source
// title. Used for ukiyo-e series like "Tabi miyage dai sanshū" where
// the source title is just the series name without a painting label,
// plus pure Cyrillic/CJK titles that have no Latin form upstream.
async function loadTitleOverrides() {
  const p = path.join(META, "title-overrides.json");
  if (!existsSync(p)) {
    console.log(`[build-data] title overrides: skipped (no metadata/title-overrides.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (!v) continue;
    // Source filenames on disk mix NFC and NFD (combining-macron) forms;
    // normalize both sides to NFC so lookup is form-insensitive.
    m.set(key.normalize("NFC"), v);
  }
  console.log(`[build-data] title overrides: ${m.size}`);
  return m;
}

// Original (pre-conversion) date strings, keyed by Wikimedia metadata
// `filename`. Populated for entries whose `date_created` was a Japanese
// era expression (e.g. "大正15年出版") that `scripts/clean-japanese-dates.mjs`
// rewrote to a Gregorian year. Surfaced as `originalDateString` so the
// detail page can show the source date alongside the cleaned form.
async function loadDateOriginals() {
  const p = path.join(META, "date-originals.json");
  if (!existsSync(p)) {
    console.log(`[build-data] date originals: skipped (no metadata/date-originals.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [fname, original] of Object.entries(raw)) {
    if (typeof original !== "string") continue;
    const t = original.trim();
    if (!t) continue;
    m.set(fname.normalize("NFC"), t);
  }
  console.log(`[build-data] date originals: ${m.size}`);
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
  let tailsCut = 0;
  for (const [id, desc] of Object.entries(raw)) {
    if (typeof desc !== "string" || !desc.trim()) continue;
    let clean = desc.trim();
    // Agent tool-call tails ("…</curatorDescription>\n<parameter…") have
    // leaked into this file before. Prose never contains a closing tag,
    // so cut at the first one as a safety net.
    const tag = clean.search(/<\/\w+>/);
    if (tag !== -1) {
      clean = clean.slice(0, tag).trim();
      tailsCut++;
    }
    if (clean) m.set(id, clean);
  }
  console.log(
    `[build-data] curator descriptions: ${m.size}${tailsCut ? ` (${tailsCut} tool-call tails cut)` : ""}`,
  );
  return m;
}

// Per-artwork movement overrides. Applied AFTER the artist-level default
// from artists-db.json. Used when an artist's by-default movement
// misclassifies a specific work (e.g. early Van Gogh in Dutch Realism
// period, Sargent studio portraits vs his plein-air landscapes).
async function loadMovementOverrides() {
  const p = path.join(META, "movement-overrides.json");
  if (!existsSync(p)) {
    console.log(`[build-data] movement overrides: skipped (no metadata/movement-overrides.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [id, mov] of Object.entries(raw)) {
    if (id.startsWith("_")) continue;
    if (typeof mov !== "string") continue;
    const v = mov.trim();
    if (!v) continue;
    m.set(id, v);
  }
  console.log(`[build-data] movement overrides: ${m.size}`);
  return m;
}

// Per-artwork artist corrections, keyed by objectKey. Commons' single
// free-text `Artist` field often names the *uploader* of a reproduction
// rather than the painter ("Ji-Elle", "Gsimonov", "PMRMaeyaert"), and those
// handles used to surface as artist pages. Applied BEFORE the artists-db
// lookup so a corrected name still picks up curated movement/nationality.
//
// A `null` value clears the artist: used when the named person only ever
// photographed the object and the underlying creator is genuinely
// unrecorded. Kept here rather than in the fetched metadata sidecar so a
// re-run of `pnpm scrape:fetch` can't silently undo the curation.
// Per-artwork creation-date corrections. Applied AFTER extractYear, which is
// a passthrough over the sidecar's own `year`.
//
// This file exists because a derived year is not durable. normalize-metadata.mjs
// recomputes `entry.year` on every run and writes it back into the sidecar, and
// fetch-wikimedia-metadata.mjs spawns the normalizer after every scrape — so a
// correction written into a sidecar survives only until the next ingest of any
// work in that folder. Overrides live here so a researched date is not silently
// re-derived from a filename or a sentence of prose.
//
// A null value clears the year (the work is genuinely undated) rather than
// letting the extractors guess one.
async function loadDateOverrides() {
  const p = path.join(META, "date-overrides.json");
  if (!existsSync(p)) {
    console.log(`[build-data] date overrides: skipped (no metadata/date-overrides.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue;
    if (value === null) {
      m.set(key.normalize("NFC"), { year: null, dateString: null });
      continue;
    }
    if (typeof value !== "object") continue;
    const year = Number.isInteger(value.year) ? value.year : null;
    const dateString =
      typeof value.dateString === "string" && value.dateString.trim()
        ? value.dateString.trim()
        : null;
    if (year === null && dateString === null) continue;
    m.set(key.normalize("NFC"), { year, dateString });
  }
  const dated = [...m.values()].filter((v) => v.year !== null).length;
  console.log(`[build-data] date overrides: ${m.size} (${m.size - dated} cleared to undated)`);
  return m;
}

// Issue years for serially-published plate sets. Applied AFTER the per-work
// date overrides, so a researched correction still beats a band.
//
// The Birds of America is the case this exists for: all 435 Havell plates
// carried 1827 because their date_created reads "between 1827 and 1838" and
// resolveYear collapses a stated range to its opening year. A set issued in
// parts over eleven years belongs on eleven points of the timeline, not one.
async function loadPlateSetDates() {
  const p = path.join(META, "plate-set-dates.json");
  if (!existsSync(p)) {
    console.log(`[build-data] plate-set dates: skipped (no metadata/plate-set-dates.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [folder, def] of Object.entries(raw)) {
    if (folder.startsWith("_")) continue;
    const ranges = (def?.ranges ?? [])
      .filter(
        (r) =>
          Number.isInteger(r.fromPlate) && Number.isInteger(r.toPlate) && Number.isInteger(r.year),
      )
      .sort((a, b) => a.fromPlate - b.fromPlate);
    if (ranges.length) m.set(folder, ranges);
  }
  const total = [...m.values()].reduce((n, rs) => n + rs.length, 0);
  console.log(`[build-data] plate-set dates: ${m.size} set(s), ${total} ranges`);
  return m;
}

// Printed plate number, read from the leading digits of the filename
// ("318_American_Avocet.jpg" -> 318). Null when the name carries none, in
// which case the work keeps whatever the normal extractors produced.
function plateNumberFromFilename(fname) {
  const m = /^(\d{1,4})[_\-. ]/.exec(fname);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isInteger(n) ? n : null;
}

async function loadArtistOverrides() {
  const p = path.join(META, "artist-overrides.json");
  if (!existsSync(p)) {
    console.log(`[build-data] artist overrides: skipped (no metadata/artist-overrides.json)`);
    return new Map();
  }
  const raw = JSON.parse(await readFile(p, "utf8"));
  const m = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue;
    if (value === null) {
      m.set(key.normalize("NFC"), null);
      continue;
    }
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (!v) continue;
    m.set(key.normalize("NFC"), v);
  }
  const cleared = [...m.values()].filter((v) => v === null).length;
  console.log(`[build-data] artist overrides: ${m.size} (${cleared} cleared to anonymous)`);
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

  const folderData = await Promise.all(
    SOURCE_FOLDERS.map((f) => readFile(path.join(META, `${f}.json`), "utf8").then(JSON.parse)),
  );
  // artists-db.json is indexed and matched by scripts/lib/artist-alias.mjs,
  // shared with the ingest scripts — the three hand-rolled matchers had
  // drifted apart and the loosest one shipped a wrong attribution.
  const { byAlias } = loadArtistsDb();
  const realDimensions = await loadRealDimensions();
  const curatorDescriptions = await loadCuratorDescriptions();
  const provenanceMap = await loadProvenance();
  const titleOverrides = await loadTitleOverrides();
  const dateOriginals = await loadDateOriginals();
  const movementOverrides = await loadMovementOverrides();
  const artistOverrides = await loadArtistOverrides();
  const dateOverrides = await loadDateOverrides();
  const plateSetDates = await loadPlateSetDates();

  const artworks = [];
  const artistAggregates = new Map();
  const droppedMissing = { count: 0, samples: [] };
  // Copyright takedowns (metadata/takedowns.json). Checked by folder and
  // filename, before anything else, so a sidecar entry that survives a
  // re-fetch, or an original re-downloaded into assets/, still never
  // reaches the catalogue.
  const takedowns = loadTakedowns();
  const droppedTakedown = { count: 0, byArtist: new Map() };
  console.log(`[build-data] takedowns: ${takedowns.size}`);

  // Slugified IDs collide for two reasons: (1) the 120-char cap collapses two
  // filenames that differ only past the prefix (e.g. Turner's
  // "...Regatta_Beating_to_Windward_No._1" and "..._No._2"), and (2) basenames
  // composed entirely of non-Latin script (Cyrillic, CJK) slugify to the empty
  // string, leaving every such file with the bare folder name. Append a
  // stable 6-char hash of the source path on collision so IDs stay unique
  // across rebuilds without depending on iteration order. The prefix is
  // shortened to make room for the suffix — otherwise the cap would strip the
  // disambiguator right back off and we'd loop forever.
  const usedIds = new Set();
  function uniqueId(baseId, sourcePath) {
    if (!usedIds.has(baseId)) {
      usedIds.add(baseId);
      return baseId;
    }
    const suffix = createHash("sha1").update(sourcePath).digest("hex").slice(0, 6);
    let n = 1;
    while (true) {
      const tag = n === 1 ? suffix : `${suffix}-${n}`;
      const room = ID_MAX_LENGTH - tag.length - 1; // -1 for the joining dash
      const prefix = baseId.slice(0, Math.max(1, room)).replace(/-+$/, "");
      const id = `${prefix}-${tag}`;
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
      n++;
    }
  }

  async function pushFromFolder(folderKey, data) {
    for (const [fname, entry] of Object.entries(data.entries)) {
      if (takedowns.has(folderKey, fname)) {
        droppedTakedown.count++;
        continue;
      }
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

      // objectKey is needed up here because the artist override is keyed by
      // it and has to land before cleanTitle (which strips the artist name
      // out of the title) and before the artists-db lookup.
      const objectKey = `${folderKey}/${fname}`;
      const objectKeyNFC = objectKey.normalize("NFC");
      const normalizedArtistName = artistOverrides.has(objectKeyNFC)
        ? artistOverrides.get(objectKeyNFC)
        : (normalizeArtistName(entry.artist) ?? null);
      let title = cleanTitle(entry.title, fname, normalizedArtistName);
      // Audubon plate filenames lead with the plate number ("100 Marsh
      // Wren"). Move it into a suffix so the display title reads as the
      // bird name the plate is actually titled after.
      if (folderKey === "audubon-birds") {
        const plate = /^(\d{1,3})\s+(.+)$/.exec(title);
        if (plate) title = `${plate[2]} (Plate ${plate[1]})`;
      }
      const dateOverride = dateOverrides.get(objectKeyNFC) ?? null;
      // Precedence: a researched per-work override, then the plate-set issue
      // schedule, then whatever normalize-metadata derived.
      let plateDate = null;
      if (!dateOverride) {
        const plate = plateNumberFromFilename(fname);
        if (plate != null) {
          plateDate =
            (plateSetDates.get(folderKey) ?? []).find(
              (r) => plate >= r.fromPlate && plate <= r.toPlate,
            ) ?? null;
        }
      }
      const year = dateOverride ? dateOverride.year : (plateDate?.year ?? extractYear(entry));
      // artists-db.json is the curated source of truth — prefer it over
      // any snapshot embedded in the metadata sidecar. Earlier the order
      // was inverted, which meant edits to db (movement renames, etc.)
      // were silently overridden by stale `artist_info` copies in the
      // Wikimedia metadata.
      //
      // Two-step lookup:
      //  1. Match the raw `artist` field against db aliases.
      //  2. If that fails (e.g. "Titian / Giorgione" — a multi-author
      //     attribution string), retry using `entry.artist_info.name`
      //     which is usually a single canonical name. This still routes
      //     through db so the live curated movement wins.
      //  3. Only as a last resort use the inline snapshot verbatim.
      // An override must stick. One that clears the artist must not have a
      // name re-introduced, and one that names an artist missing from the db
      // ("After Peter Paul Rubens", a copy) must not be routed back through
      // the sidecar's `artist_info`, which still carries the attribution the
      // override exists to correct.
      const artistCleared = artistOverrides.get(objectKeyNFC) === null;
      const artistOverridden = artistOverrides.has(objectKeyNFC);
      let artistInfo = matchArtist(normalizedArtistName, byAlias);
      if (!artistInfo && !artistOverridden && entry.artist_info) {
        // entry.artist_info acts as a per-record fallback: use its name to
        // re-query the curated db when present, otherwise inject the
        // movement/nationality directly. The name-less form is how
        // genuinely anonymous works (e.g. the Hungry Ghosts Scroll) opt
        // out of the European year fallback in gallery-eras.
        artistInfo = entry.artist_info.name
          ? (matchArtist(entry.artist_info.name, byAlias) ?? entry.artist_info)
          : entry.artist_info;
      }
      artistInfo = artistInfo ?? null;
      // An artist the curated db marks "copyrighted" is still in copyright
      // where the site is operated, and that term runs from the artist's
      // death, not from the date of any one work — so every work by them is
      // withheld. This catches a re-ingest under a filename takedowns.json
      // has never seen. Narrower statuses ("copyrighted_in_us_until_…")
      // are deliberately not matched.
      if (artistInfo?.pd_status === "copyrighted") {
        droppedTakedown.count++;
        droppedTakedown.byArtist.set(
          artistInfo.name,
          (droppedTakedown.byArtist.get(artistInfo.name) ?? 0) + 1,
        );
        continue;
      }
      // Prefer the canonical name from the artists DB so casing variants
      // ("Claude monet"), spelling variants ("Rafael" → "Raphael", "Alfons
      // Mucha" → "Alphonse Mucha"), and ordering variants ("Yamamoto Kanae"
      // → "Kanae Yamamoto") collapse onto a single artist page.
      const artistName = artistCleared ? null : (artistInfo?.name ?? normalizedArtistName);
      const artistSlug = artistName ? slugify(artistName) : "unknown";
      const englishTitle = titleOverrides.get(objectKeyNFC) ?? null;
      // The filename is the primary slug source; artworkId() falls back to
      // the English/romanized title and then to a hash of the source path
      // for stems that slugify to nothing. Shared with the maintenance
      // scripts so they derive the same id for the same file.
      const baseId = artworkId(folderKey, fname, { fallbackTitle: englishTitle ?? title });
      const id = uniqueId(baseId, `${folderKey}/${fname}`);

      const dims = await dimensionsFor(folderKey, fname);
      const real = realDimensions.get(id) || null;
      const variantWidths = variantWidthsFor(folderKey, fname);
      const dominantColor = await dominantColorFor(folderKey, fname);
      const colorProfile = await colorProfileFor(folderKey, fname);
      const originalDateString = dateOriginals.get(fname.normalize("NFC")) ?? null;
      artworks.push({
        id,
        title,
        englishTitle,
        artist: artistName,
        artistSlug,
        year,
        dateCreated:
          dateOverride?.dateString ??
          plateDate?.dateString ??
          (stripQuickStatements(entry.date_created) || null),
        originalDateString,
        description: curatorDescriptions.get(id) ?? firstLineDescription(entry.description),
        folder: folderKey,
        objectKey,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        realDimensions: real,
        variantWidths: variantWidths.length > 0 ? variantWidths : null,
        dominantColor,
        colorBuckets: colorProfile?.buckets ?? null,
        colorStrength: colorProfile?.strength ?? null,
        fileUrl: entry.source.file_url,
        commonsUrl: entry.source.url,
        credit: cleanCredit(entry.source.credit),
        license: entry.copyright.license_short || "Public domain",
        movement: movementOverrides.get(id) ?? artistInfo?.movement ?? null,
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
          agg.coverObjectKey = objectKey;
          agg.coverTitle = englishTitle ?? title;
          agg.coverVariantWidths = variantWidths.length > 0 ? variantWidths : null;
        }
      }
    }
  }

  // Probe every image we're going to keep up front, in parallel and against
  // the on-disk cache, so pushFromFolder below never blocks on sharp.
  const probeWork = [];
  for (let i = 0; i < SOURCE_FOLDERS.length; i++) {
    const folderKey = SOURCE_FOLDERS[i];
    for (const [fname, entry] of Object.entries(folderData[i].entries)) {
      if (takedowns.has(folderKey, fname)) continue;
      if (!keepEntry(entry)) continue;
      if (!existsSync(path.join(ASSETS, folderKey, fname))) continue;
      probeWork.push({ folderKey, fname });
    }
  }
  await prefillImageProbes(probeWork);

  for (let i = 0; i < SOURCE_FOLDERS.length; i++) {
    await pushFromFolder(SOURCE_FOLDERS[i], folderData[i]);
  }

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

  if (droppedTakedown.count > 0) {
    const byArtist = [...droppedTakedown.byArtist].map(([n, c]) => `${n} ${c}`).join(", ");
    console.log(
      `[build-data] withheld ${droppedTakedown.count} entries for copyright (takedowns.json, or an artist marked "copyrighted"${byArtist ? `: ${byArtist}` : ""})`,
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
