// The one artist-alias index shared by every pipeline script.
//
// There used to be three matchers with three different rules: a bare
// `includes` in fetch-wikimedia-metadata.mjs, fold + last-token guard in
// build-data.mjs, and the guard without folding in normalize-metadata.mjs.
// The loose one mis-attributed real works: Commons lists
// `Circle_of_Pieter_Bruegel_the_Elder_-_Winter_Landscape_with_a_Bird_Trap.jpg`
// as "Pieter Brueghel the Younger", the bare substring hit the single-token
// "Brueghel" alias of Pieter Bruegel *the Elder*, and that snapshot was baked
// into the sidecar and shipped in the catalogue.
//
// The rules here are the strictest of the three:
//   - fold before comparing, so "Vigée" and "Vigee" collide;
//   - an exact folded hit on an alias or the canonical name always wins;
//   - a SINGLE-token alias ("Brueghel", "Goya") only matches when it is the
//     input's last token — otherwise a surname swallows a different artist
//     via a middle name ("Friedrich" → "Karl Friedrich Schinkel") or an
//     epithet ("Brueghel" → "Pieter Brueghel the Younger");
//   - a multi-token alias matches on containment either way, which covers
//     punctuation and short-form variants ("Vincent van Gogh." → "Vincent van
//     Gogh");
//   - only the unqualified part of a name is matched, so containment cannot
//     read the painter out of "Follower of Hieronymus Bosch" or "Giovanni
//     Cariani / Formerly attributed to Titian" (see unqualifiedArtistName).
//
// Callers that hold a raw Commons artist string get more hits by normalising
// it first (build-data.mjs's normalizeArtistName strips "(1848 - 1903)",
// "Details on Google Art Project", "Lastname, Firstname" ordering, …). The
// matcher deliberately does none of that itself: it compares names, it does
// not clean them.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ARTISTS_DB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "artists-db.json",
);

export function foldArtistName(s) {
  // NFKD + strip combining marks so "Vigée" and "Vigee" collide.
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function buildArtistAliasIndex(artists) {
  const byAlias = new Map();
  for (const a of artists || []) {
    for (const alias of a.aliases || [a.name]) {
      byAlias.set(foldArtistName(alias), a);
    }
    byAlias.set(foldArtistName(a.name), a);
  }
  return byAlias;
}

// Reads scripts/artists-db.json and returns both the raw list and the alias
// index. Throws when the file is missing or malformed — callers that treat
// the curated DB as optional wrap this in a try/catch.
export function loadArtistsDb() {
  const { artists } = JSON.parse(readFileSync(ARTISTS_DB_PATH, "utf8"));
  return { artists, byAlias: buildArtistAliasIndex(artists) };
}

// Wording that credits a work to someone other than the painter it names: a
// follower, a workshop, a copyist ("After Peter Paul Rubens"), or a painter
// the work has been taken away from ("Formerly attributed to Titian").
// "Attributed to X", "X and workshop" and "X or workshop" are left out on
// purpose: museums catalogue those under X.
const ARTIST_QUALIFIER =
  /\b(?:(?:follower|circle|workshop|studio|school|imitator|manner|pupil)\s+of|formerly\s+attributed\s+to|after)\b/i;

export function isQualifiedArtistName(name) {
  return Boolean(name) && ARTIST_QUALIFIER.test(name);
}

// The part of an artist string that names the maker. Commons joins credits
// with " / "; a credit that opens with a qualifier is dropped, and one with a
// qualifier inside is cut there ("Jean-Nicolas Laugier after Jacques-Louis
// David" → "Jean-Nicolas Laugier"). Empty when every credit is qualified.
export function unqualifiedArtistName(name) {
  return String(name)
    .split(/\s+\/\s+/)
    .map((credit) => {
      const q = ARTIST_QUALIFIER.exec(credit);
      return (q ? credit.slice(0, q.index) : credit).replace(/[\s,;:–—-]+$/u, "");
    })
    .filter(Boolean)
    .join(" / ");
}

export function matchArtist(name, byAlias) {
  if (!name) return null;
  const whole = foldArtistName(name);
  if (byAlias.has(whole)) return byAlias.get(whole);
  const low = foldArtistName(unqualifiedArtistName(name));
  if (!low) return null;
  if (byAlias.has(low)) return byAlias.get(low);
  const lowTokens = low.split(/\s+/).filter(Boolean);
  const lowLast = lowTokens[lowTokens.length - 1];
  for (const [alias, a] of byAlias) {
    if (!alias) continue;
    const aliasTokens = alias.split(/\s+/).filter(Boolean);
    if (aliasTokens.length === 1) {
      if (alias === lowLast) return a;
      continue;
    }
    if (low.includes(alias) || alias.includes(low)) return a;
  }
  return null;
}

// Exact folded hit only, for a name a person has already researched (an
// artist override). The override already says who made the work, so it is a
// db artist or its own artist, never a near match: containment would still
// find "Rembrandt" inside a researched "Attributed to Rembrandt", which the
// qualifier rule leaves alone, and file it under the painter the override
// exists to take it away from.
export function matchArtistExact(name, byAlias) {
  if (!name) return null;
  return byAlias.get(foldArtistName(name)) ?? null;
}
