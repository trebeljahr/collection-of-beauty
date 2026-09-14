// Batch cache and title resolution for fetch-wikimedia-metadata.mjs.
//
// Pure functions (plus two small fs helpers) so tests/commons-batch.test.ts
// can exercise them against real payload shapes without the network.

import fs from "node:fs";

// Bump when the on-disk envelope changes. Anything else reads as stale.
export const BATCH_CACHE_VERSION = 2;

// The title the script sends for a filename.
export const requestTitle = (filename) => "File:" + filename.replace(/ /g, "_");

// One key per Commons page. MediaWiki treats underscores and spaces as the
// same character, stores titles in NFC, and uppercases the first letter of
// the page name, so two titles that differ only in those ways name one page.
// Files on disk are a mix of NFC and NFD (a Docker upload decomposes names),
// which is why the raw string can't be used as a map key.
export function titleKey(title) {
  let t = String(title).normalize("NFC").replace(/_/g, " ").replace(/ +/g, " ").trim();
  const m = /^file:\s*/i.exec(t);
  if (m) t = t.slice(m[0].length);
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return `File:${t}`;
}

// `normalized[].from` is percent-encoded when `fromencoded` is set, which is
// what MediaWiki does for any title it received in a non-NFC form.
function decodeFrom(n) {
  if (!n.fromencoded) return n.from;
  try {
    return decodeURIComponent(n.from);
  } catch {
    return n.from;
  }
}

// filename -> page object (or null) for every filename in a batch.
//
// The `normalized` list can chain: an NFD title maps to its NFC underscored
// form, and the page itself is keyed by the spaced form. A single map lookup
// stopped after the first hop and dropped the page, so this follows the
// chain to a fixed point, comparing titles by titleKey throughout.
export function resolveBatchPages(payload, filenames) {
  const next = new Map();
  for (const n of payload?.query?.normalized || []) {
    const from = titleKey(decodeFrom(n));
    const to = titleKey(n.to);
    if (from !== to) next.set(from, to);
  }
  const pagesByKey = new Map();
  for (const p of payload?.query?.pages || []) {
    if (p?.title) pagesByKey.set(titleKey(p.title), p);
  }

  const out = new Map();
  for (const filename of filenames) {
    let key = titleKey(requestTitle(filename));
    const seen = new Set([key]);
    while (next.has(key)) {
      key = next.get(key);
      if (seen.has(key)) break;
      seen.add(key);
    }
    out.set(filename, pagesByKey.get(key) || null);
  }
  return out;
}

// One payload from the answers to two halves of a batch. Only the fields
// resolveBatchPages reads are merged.
export function mergePayloads(a, b) {
  return {
    query: {
      normalized: [...(a?.query?.normalized || []), ...(b?.query?.normalized || [])],
      pages: [...(a?.query?.pages || []), ...(b?.query?.pages || [])],
    },
  };
}

export const hasImageInfo = (page) => Boolean(page && !page.missing && page.imageinfo?.[0]);

// A cache file is reused only when it was written for exactly this batch.
// Batches are numbered by position in the sorted file listing, so adding,
// removing or renaming one file shifts every later batch onto a response
// written for different files. Files written before the envelope existed
// carry no filename list and are always stale.
//
// Returns { status: "hit" | "stale" | "legacy" | "missing", payload }.
export function readBatchCache(file, filenames) {
  if (!fs.existsSync(file)) return { status: "missing", payload: null };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { status: "stale", payload: null };
  }
  if (raw?.cache_version !== BATCH_CACHE_VERSION || !Array.isArray(raw.filenames)) {
    return { status: "legacy", payload: null };
  }
  const same =
    raw.filenames.length === filenames.length && raw.filenames.every((f, i) => f === filenames[i]);
  return same ? { status: "hit", payload: raw.payload } : { status: "stale", payload: null };
}

export function writeBatchCache(file, filenames, payload) {
  const envelope = { cache_version: BATCH_CACHE_VERSION, filenames, payload };
  fs.writeFileSync(file, JSON.stringify(envelope, null, 2));
}

// Scripts other than Latin that have regressed on a refetch before.
const NON_LATIN =
  /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
export const isNonLatinName = (filename) => NON_LATIN.test(filename);

// Compare freshly built entries against the current sidecar entries.
// Sidecar keys may be NFC or NFD independently of the disk, so both sides
// are matched on the NFC form.
export function diffResolution(currentEntries, nextEntries) {
  const current = new Map();
  for (const [k, v] of Object.entries(currentEntries || {})) current.set(k.normalize("NFC"), v);
  const nextKeys = new Set();

  const regressed = []; // resolved:true -> resolved:false
  const recovered = []; // resolved:false -> resolved:true
  const retargeted = []; // resolved both times, but to a different page
  const added = []; // not in the current sidecar
  for (const [filename, entry] of Object.entries(nextEntries)) {
    const key = filename.normalize("NFC");
    nextKeys.add(key);
    const old = current.get(key);
    if (!old) {
      added.push(filename);
      continue;
    }
    if (old.resolved && !entry.resolved) regressed.push(filename);
    else if (!old.resolved && entry.resolved) recovered.push(filename);
    else if (old.resolved && entry.resolved) {
      const a = old.source?.canonical_title;
      const b = entry.source?.canonical_title;
      if (a && b && titleKey(a) !== titleKey(b)) retargeted.push({ filename, from: a, to: b });
    }
  }
  // Present in the sidecar but no longer listed: a rewrite drops these.
  const dropped = [...current.keys()].filter((k) => !nextKeys.has(k));
  return { regressed, recovered, retargeted, added, dropped };
}
