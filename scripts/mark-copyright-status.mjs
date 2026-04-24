#!/usr/bin/env node
// Annotate entries with a `pd_status` field so the gallery builder can filter
// by copyright posture without re-deriving the rules from raw metadata.
//
// Values written to entry.pd_status:
//
//   "public_domain"       PD in source country AND the US.
//   "uraa_restricted"     PD in source country (Japan/etc.) but the US
//                         copyright was restored by the URAA; pre-1931
//                         rule does not apply because publication is 1931+.
//                         Do not display; Wikimedia Commons itself only
//                         accepts pre-1931 works by these artists.
//   "copyrighted"         Not PD in source country yet. (Not used by this
//                         script; left for future rules.)
//   "needs_review"        Not enough info to decide automatically.
//
// The script is idempotent — rerun after normalize-metadata.mjs or after new
// fetches and it will re-stamp every entry from scratch.
//
// Usage:
//   node scripts/mark-copyright-status.mjs
//   node scripts/mark-copyright-status.mjs collection-of-beauty.json

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

// US copyright PD cutoff as of today (2026): works first published before
// January 1, 1931 are in the US public domain. This cutoff advances by one
// calendar year every January 1st.
const US_PD_CUTOFF_YEAR = 1931;

// Hard-coded URAA-subject artists whose source-country term is shorter than
// the US term, so their pre-1931 works are PD in the US but later works are
// still restricted. Japanese shin-hanga artists are the canonical case.
// Extend this list when similar artists appear in the catalog.
const URAA_ARTISTS = [
  {
    key: "yoshida_hiroshi",
    match: ({ artist, filename }) => {
      const a = (artist || "").toLowerCase();
      const fn = (filename || "").toLowerCase();
      if (a.includes("kanae") || a.includes("yamamoto") || a.includes("yamakawa")) return false;
      return (
        a.includes("hiroshi yoshida") ||
        a.includes("yoshida hiroshi") ||
        fn.includes("hiroshi_yoshida") ||
        fn.includes("yoshida_hiroshi")
      );
    },
    // Known publication years for Yoshida series we cannot otherwise date.
    year_overrides: {
      "A_Gate_to_the_Stupa_of_Sanchi,_from_the_Series__India_and_Southeast_Asia_._Hiroshi_Yoshida.jpg": 1932, // India/SE Asia series 1931–32
      "Kagurazaka_Street_at_Night_after_Rain,_from_the_Series__Twelve_Scenes_of_Tokyo_._Hiroshi_Yoshida.jpg": 1929, // Twelve Scenes of Tokyo 1928–29
      "The_Wetterhorn,_from__The_Europe_Series_._Hiroshi_Yoshida.jpg": 1925, // Europe series 1925
    },
  },
  {
    key: "kawase_hasui",
    match: ({ artist, filename }) => {
      const a = (artist || "").toLowerCase();
      const fn = (filename || "").toLowerCase();
      return a.includes("hasui") || a.includes("kawase") || fn.includes("hasui") || fn.includes("kawase");
    },
    year_overrides: {},
  },
];

function matchUraaArtist(filename, entry) {
  for (const a of URAA_ARTISTS) {
    if (a.match({ artist: entry.artist, filename })) return a;
  }
  return null;
}

function decideStatus(filename, entry) {
  const uraa = matchUraaArtist(filename, entry);
  if (uraa) {
    const year = uraa.year_overrides[filename] ?? entry.year;
    if (year == null) return { status: "needs_review", reason: "URAA artist, no creation year known" };
    if (year < US_PD_CUTOFF_YEAR) return { status: "public_domain", reason: `pre-${US_PD_CUTOFF_YEAR} (URAA-exempt)` };
    return { status: "uraa_restricted", reason: `${year} is >= ${US_PD_CUTOFF_YEAR}; US copyright restored by URAA` };
  }

  // General post-1930 rule: 95-year US copyright term on any work first
  // published 1931 or later is still in force until at least 2027. Even when
  // Commons tags the file as "public domain" under source-country rules, it
  // is not yet safe in the US. Conservatively flag as URAA-restricted so the
  // gallery drops it.
  if (typeof entry.year === "number" && entry.year >= US_PD_CUTOFF_YEAR) {
    return {
      status: "uraa_restricted",
      reason: `year ${entry.year} is >= ${US_PD_CUTOFF_YEAR}; US 95-year copyright term not yet expired`,
    };
  }

  // Default: trust the existing copyright.copyrighted flag, if set.
  if (entry.copyright && entry.copyright.copyrighted === false) return { status: "public_domain", reason: "Commons PD license" };
  if (entry.copyright && entry.copyright.copyrighted === true) return { status: "copyrighted", reason: "Commons copyrighted license" };
  return { status: "needs_review", reason: "no explicit copyright signal" };
}

function processFile(relPath) {
  const full = path.join(ROOT, "metadata", relPath);
  if (!fs.existsSync(full)) {
    console.log(`[skip] ${relPath} (not found)`);
    return;
  }
  const d = JSON.parse(fs.readFileSync(full, "utf8"));
  if (!d.entries) {
    console.log(`[skip] ${relPath} (no entries)`);
    return;
  }

  const tally = { public_domain: 0, uraa_restricted: 0, copyrighted: 0, needs_review: 0 };
  const uraaNames = [];
  for (const [fn, entry] of Object.entries(d.entries)) {
    const { status, reason } = decideStatus(fn, entry);
    entry.pd_status = status;
    entry.pd_status_reason = reason;
    tally[status]++;
    if (status === "uraa_restricted") uraaNames.push(fn);
  }

  fs.writeFileSync(full, JSON.stringify(d, null, 2));
  console.log(
    `[${relPath}] public_domain=${tally.public_domain}, uraa_restricted=${tally.uraa_restricted}, copyrighted=${tally.copyrighted}, needs_review=${tally.needs_review}`,
  );
  if (uraaNames.length) {
    console.log(`  URAA-restricted (${uraaNames.length}):`);
    uraaNames.sort().forEach((n) => console.log(`    - ${n}`));
  }
}

const args = process.argv.slice(2);
const files = args.length ? args : DEFAULT_FILES;
for (const f of files) processFile(f);
