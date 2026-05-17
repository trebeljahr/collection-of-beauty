/**
 * NSFW detection for collection works.
 *
 * Launch baseline: title-keyword heuristic. Intended to be replaced by a
 * curated `nsfw: true` flag on individual Artwork records once the
 * collection is hand-reviewed. Until then, anything matching the keyword
 * list (English / German / French / common mythological-nude cues) gets
 * flagged. False positives are acceptable for launch — the toggle only
 * affects first impression, not access.
 */

// Multi-word phrases match as substrings; single tokens match against a
// tokenised title (so "nu" doesn't fire on "nuance" and "akt" doesn't
// fire on "akkadian").
const PHRASES = ["after the bath", "the bath", "bain "];
const TOKENS = new Set<string>([
  // English
  "nude",
  "nudes",
  "naked",
  "bather",
  "bathers",
  "venus",
  "odalisque",
  "danae",
  "danaë",
  "leda",
  "susanna",
  "lovers",
  // German
  "akt",
  "akte",
  "nackt",
  "nackte",
  "nackter",
  // French
  "nu",
  "nue",
  "nus",
  "nues",
  "baigneuse",
  "baigneur",
  "baigneuses",
  "baigneurs",
  // Latin / mythological cues
  "amor",
  "eros",
]);

const TOKEN_SPLIT = /[\s,.;:'"()\-–—!?/]+/;

export function isNsfwTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  for (const phrase of PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  const tokens = lower.split(TOKEN_SPLIT);
  for (const t of tokens) {
    if (t && TOKENS.has(t)) return true;
  }
  return false;
}

export function isNsfwArtwork(a: { title: string | null; nsfw?: boolean | null }): boolean {
  if (a.nsfw === true) return true;
  if (a.nsfw === false) return false;
  return isNsfwTitle(a.title);
}
