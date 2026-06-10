#!/usr/bin/env node
/**
 * Apply the unresolved-entry resolver workflow output (/tmp/wf-resolve.json)
 * to the live sidecar. For each "resolved" record:
 *   - flip resolved/needs_review,
 *   - copy artist/year/dateCreated/description into the entry,
 *   - set source.url + source.file_url + source.canonical_title,
 *   - set copyright fields,
 *   - also write English title override + curator description.
 *
 * For records whose fileUrl is null (agent hit a rate limit between search and
 * imageinfo), refetch imageinfo server-side from the canonical title before
 * applying. Records without a canonical title are left alone.
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIDECAR = path.join(ROOT, "metadata", "collection-of-beauty.json");
const TITLES = path.join(ROOT, "metadata", "title-overrides.json");
const DESCS = path.join(ROOT, "metadata", "curator-descriptions.json");

const USER_AGENT =
  "CollectionOfBeautyMetadata/1.0 (personal archive cataloguing; contact: local user) Node/24";
const API_URL = "https://commons.wikimedia.org/w/api.php";
const DELAY_MS = 250;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsGetJson(url, retry = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }, (res) => {
        const retryAfter = Number.parseInt(res.headers["retry-after"] || "0", 10);
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", async () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          } else if (res.statusCode === 503 || res.statusCode === 429) {
            if (retry >= MAX_RETRIES) return reject(new Error(`HTTP ${res.statusCode}`));
            await sleep(Math.max((retryAfter || 5) * 1000, 2000));
            httpsGetJson(url, retry + 1).then(resolve, reject);
          } else reject(new Error(`HTTP ${res.statusCode}`));
        });
      })
      .on("error", reject);
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

function emVal(em, key) {
  if (!em || !em[key]) return null;
  return stripHtml(em[key].value);
}

async function fetchImageInfo(canonicalTitle) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "extmetadata|url|canonicaltitle",
    iiextmetadatafilter:
      "ObjectName|Artist|DateTimeOriginal|LicenseShortName|Copyrighted|UsageTerms|Credit|ImageDescription|LicenseUrl|Permission|Attribution",
    iiextmetadatalanguage: "en",
    maxlag: "5",
    titles: `File:${canonicalTitle.replace(/ /g, "_")}`.normalize("NFC"),
  });
  const payload = await httpsGetJson(`${API_URL}?${params.toString()}`);
  const page = payload?.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo?.[0]) return null;
  const ii = page.imageinfo[0];
  const em = ii.extmetadata || {};
  const licShort = emVal(em, "LicenseShortName");
  const copyrightedRaw = emVal(em, "Copyrighted");
  let copyrighted = null;
  if (copyrightedRaw) {
    if (/^true$/i.test(copyrightedRaw)) copyrighted = true;
    else if (/^false$/i.test(copyrightedRaw)) copyrighted = false;
  }
  if (copyrighted == null && licShort) {
    if (/public domain/i.test(licShort) || /^pd/i.test(licShort)) copyrighted = false;
    else if (/^cc/i.test(licShort) || /gfdl/i.test(licShort)) copyrighted = true;
  }
  return {
    canonicaltitle: ii.canonicaltitle || page.title,
    url: ii.url,
    pageUrl:
      "https://commons.wikimedia.org/wiki/" +
      encodeURIComponent((page.title || "").replace(/ /g, "_")),
    artist: emVal(em, "Artist"),
    dateOriginal: emVal(em, "DateTimeOriginal"),
    description: emVal(em, "ImageDescription"),
    credit: emVal(em, "Credit"),
    permission: emVal(em, "Permission"),
    attribution: emVal(em, "Attribution"),
    licenseShort: licShort,
    licenseUrl: emVal(em, "LicenseUrl"),
    usageTerms: emVal(em, "UsageTerms"),
    copyrighted,
  };
}

const wf = JSON.parse(fs.readFileSync("/tmp/wf-resolve.json", "utf8"));
const result = wf.result;
const sidecar = JSON.parse(fs.readFileSync(SIDECAR, "utf8"));
const titles = JSON.parse(fs.readFileSync(TITLES, "utf8"));
const descs = JSON.parse(fs.readFileSync(DESCS, "utf8"));

// macOS / Wikimedia filenames flip between NFC and NFD. Index the sidecar by
// both so lookups succeed regardless of the form the workflow returned.
const entryByNormalised = new Map();
for (const key of Object.keys(sidecar.entries)) {
  entryByNormalised.set(key.normalize("NFC"), key);
  entryByNormalised.set(key.normalize("NFD"), key);
}
function entryKeyFor(filename) {
  if (sidecar.entries[filename]) return filename;
  return (
    entryByNormalised.get(filename.normalize("NFC")) ||
    entryByNormalised.get(filename.normalize("NFD")) ||
    null
  );
}

let applied = 0;
let backfilled = 0;
let skipped = 0;
const failures = [];

for (const f of result.resolved) {
  const key = entryKeyFor(f.filename);
  if (!key) {
    failures.push(`missing-entry:${f.filename}`);
    continue;
  }
  const entry = sidecar.entries[key];
  // Use the live sidecar key (preserves its original normalisation form)
  // for the title-override + curator-description side writes below.
  const liveFilename = key;
  let fileUrl = f.fileUrl;
  let canonical = f.canonicalTitle;
  let licenseShort = f.licenseShort;
  let copyrighted = f.copyrighted;
  let dateCreated = f.dateCreated;
  let description = f.description;
  let credit = null;
  let permission = null;
  let attribution = null;
  let pageUrl = f.commonsUrl;
  let licenseUrl = null;
  let usageTerms = null;

  // Sanity: agents sometimes returned a placeholder fileUrl
  if (fileUrl && /upload\.wikimedia\.org\/.*\/original\/file$/.test(fileUrl)) {
    fileUrl = null;
  }

  if (!fileUrl && canonical) {
    try {
      const ii = await fetchImageInfo(canonical);
      await sleep(DELAY_MS);
      if (ii) {
        fileUrl = ii.url;
        canonical = ii.canonicaltitle.replace(/^File:/, "");
        if (!description && ii.description) description = ii.description;
        if (!licenseShort) licenseShort = ii.licenseShort;
        if (copyrighted == null) copyrighted = ii.copyrighted;
        if (!dateCreated && ii.dateOriginal) dateCreated = ii.dateOriginal;
        credit = ii.credit;
        permission = ii.permission;
        attribution = ii.attribution;
        pageUrl = ii.pageUrl;
        licenseUrl = ii.licenseUrl;
        usageTerms = ii.usageTerms;
        backfilled++;
      }
    } catch (e) {
      // backfill failure — fall through, will be skipped due to missing fileUrl
      failures.push(`backfill-failed:${f.filename}:${e.message}`);
    }
  }

  if (!fileUrl) {
    skipped++;
    continue;
  }

  // Apply
  entry.resolved = true;
  entry.needs_review = false;
  if (f.artist) entry.artist = f.artist;
  if (f.year != null) entry.year = f.year;
  if (dateCreated) entry.date_created = dateCreated;
  if (description) entry.description = description;
  if (f.englishTitle) {
    // keep raw title in sidecar; English form goes through title-overrides
    titles[`collection-of-beauty/${liveFilename}`] = f.englishTitle;
  }

  entry.source = {
    type: "Wikimedia Commons",
    canonical_title: canonical,
    url: pageUrl ||
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(canonical.replace(/ /g, "_"))}`,
    file_url: fileUrl,
    credit,
    permission,
    attribution,
  };
  entry.copyright = {
    copyrighted,
    license_short: licenseShort,
    license_url: licenseUrl,
    usage_terms: usageTerms,
  };

  // Optional curator description (only if the agent supplied something
  // distinct from the sidecar description and we don't already have one).
  if (f.description && f.description !== description) {
    // Use the entry id form expected by curator-descriptions: slug of
    // `collection-of-beauty-<filename-without-ext>` capped at 120 chars.
    const base = `collection-of-beauty-${liveFilename.replace(/\.[^.]+$/, "")}`
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120);
    descs[base] = f.description;
  }

  applied++;
}

fs.writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
fs.writeFileSync(TITLES, JSON.stringify(titles, null, 2) + "\n");
fs.writeFileSync(DESCS, JSON.stringify(descs, null, 2) + "\n");

console.log(
  `apply-resolve-workflow: applied=${applied} backfilled=${backfilled} skipped=${skipped} failures=${failures.length}`,
);
if (failures.length) {
  console.log("first 10 failures:");
  for (const f of failures.slice(0, 10)) console.log(" ", f);
}
