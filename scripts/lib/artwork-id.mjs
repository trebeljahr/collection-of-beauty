// The artwork id builder, shared by build-data.mjs and the maintenance
// scripts that have to guess an id for a file they are about to move or
// retire. It used to be copy-pasted into remove-artworks.mjs and
// apply-hires-replacements.mjs, and both copies had drifted: no
// transliteration, no hashed fallback. apply-hires-replacements derives ids
// from filenames it downloads at runtime, so a Cyrillic or CJK name there
// slugified to nothing and re-keyed curator descriptions onto the bare
// folder name.
//
// build-data.mjs owns one extra step this module cannot: on a collision it
// appends a hash of the source path, which needs the whole corpus. The id
// returned here is therefore the *pre-collision* id — right for every work
// whose base id is unique, which is all but a handful.

import { createHash } from "node:crypto";

// The id length cap. build-data shortens the prefix to make room for a
// collision suffix, so this is the ceiling for both forms.
export const ID_MAX_LENGTH = 120;

// Cyrillic \u2192 Latin transliteration, applied before the slug strip. The
// corpus is Russian-heavy; without this, a filename composed entirely of
// Cyrillic ("\u0410\u0439\u0432\u0430\u0437\u043e\u0432\u0441\u043a\u0438\u0439\u2026\u0411\u043e\u0441\u0444\u043e\u0440\u0435.jpg") slugifies to the empty string and
// collapses onto the bare folder name ("collection-of-beauty"). That
// produces unstable, meaningless ids that mis-key id-keyed metadata
// (curator descriptions, dimensions). Lowercase keys only \u2014 slugify()
// lowercases first. Covers Russian plus the common Ukrainian/Serbian
// letters; anything unmapped falls through to the title fallback in the
// id builder below.
const CYRILLIC_TRANSLIT = {
  \u0430: "a", \u0431: "b", \u0432: "v", \u0433: "g", \u0434: "d", \u0435: "e", \u0451: "yo", \u0436: "zh", \u0437: "z",
  \u0438: "i", \u0439: "y", \u043a: "k", \u043b: "l", \u043c: "m", \u043d: "n", \u043e: "o", \u043f: "p", \u0440: "r",
  \u0441: "s", \u0442: "t", \u0443: "u", \u0444: "f", \u0445: "kh", \u0446: "ts", \u0447: "ch", \u0448: "sh",
  \u0449: "shch", \u044a: "", \u044b: "y", \u044c: "", \u044d: "e", \u044e: "yu", \u044f: "ya",
  \u0456: "i", \u0457: "yi", \u0454: "ye", \u0491: "g", \u045e: "u", \u0458: "j", \u0452: "dj", \u045b: "c",
  \u045f: "dz", \u045a: "nj", \u0459: "lj", \u0455: "dz", \u0453: "g", \u045c: "k",
};

export function transliterate(s) {
  let out = "";
  for (const ch of s) out += CYRILLIC_TRANSLIT[ch] ?? ch;
  return out;
}

export function slugify(input) {
  return transliterate(input.toLowerCase())
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// `<folder>-<slugified filename stem>`, capped at ID_MAX_LENGTH.
//
// When the stem is written in a script transliterate() doesn't cover (CJK,
// Arabic) it slugifies to the empty string; fall back to the work's title
// and then to a stable hash of the source path, so the id never collapses
// onto the bare folder name — the unstable slot that used to mis-key
// id-keyed metadata (curator descriptions, dimensions).
export function artworkId(folder, filename, { fallbackTitle } = {}) {
  const stem = filename.replace(/\.[^.]+$/, "");
  const baseStem =
    slugify(stem) ||
    slugify(fallbackTitle ?? "") ||
    createHash("sha1").update(`${folder}/${filename}`).digest("hex").slice(0, 8);
  return slugify(`${folder}-${baseStem}`).slice(0, ID_MAX_LENGTH);
}
