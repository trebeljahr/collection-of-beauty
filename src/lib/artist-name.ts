/**
 * Shape checks for artist names coming out of the ingest pipeline.
 *
 * Wikimedia Commons has a single free-text `Artist` field, and for a
 * photographic reproduction of a painting it is routinely filled with the
 * *uploader's* username rather than the painter — "Ji-Elle", "Gsimonov",
 * "PMRMaeyaert". Those flow straight through to `artist` in the generated
 * data, where they become artist pages with real bio chrome and sitemap
 * entries for people who only pressed the shutter.
 *
 * These predicates are a tripwire, not a classifier: they flag names whose
 * *shape* says "handle" or "placeholder" so a human curates them (see
 * `metadata/artist-overrides.json`). They cannot catch an uploader whose
 * username happens to look like an ordinary personal name — "Jean-Marc
 * Pascolo" is indistinguishable from a painter by shape alone, and was
 * found by reading Commons categories instead.
 */

/** Tokens that carry no attribution on their own. */
const PLACEHOLDER_TOKENS = new Set([
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

/** The subset above that actively asserts "we don't know". */
const NEGATION_TOKENS = new Set(["unknown", "anonymous", "unidentified", "none", "n/a", "na"]);

/** Commons editors sometimes leave an instruction in the Artist field. */
const META_INSTRUCTION =
  /^see\s+(the\s+)?(filename|file\s*name|category|categories|description|source|below|above)\b/i;

export type ArtistNameFlag =
  /** Not an attribution at all — "Unknown author", "see filename or category". */
  | "placeholder"
  /** Shaped like a Commons username — "dalbera", "PMRMaeyaert", "Ji-Elle". */
  | "uploader-handle"
  /**
   * A single capitalised word. Real mononym artists look exactly like
   * uploader handles ("Giorgione" vs "Illufant"), so shape can't separate
   * them — callers should confirm against the curated artists DB.
   */
  | "unconfirmed-mononym";

function tokenize(name: string): string[] {
  return name
    .replace(/[.,;:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** "Unknown author", "Unknown author Unknown author", "author author", "see filename or category". */
export function isPlaceholderArtistName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (META_INSTRUCTION.test(trimmed)) return true;

  const tokens = tokenize(trimmed.toLowerCase());
  if (tokens.length === 0) return true;
  // Every token must be a placeholder word, and at least one must actually
  // say "unknown" — otherwise a real surname that happens to collide with a
  // role word would be nulled out.
  if (!tokens.every((t) => PLACEHOLDER_TOKENS.has(t))) return false;
  if (tokens.some((t) => NEGATION_TOKENS.has(t))) return true;
  // Bare repeated role words ("author author", "photographer photographer")
  // are what's left after an upstream cleaner strips the "Unknown".
  return tokens.length > 1 && new Set(tokens).size < tokens.length;
}

/**
 * A token like "FilpoC" (stray trailing capital) or "PMRMaeyaert" (initials
 * run into a surname).
 *
 * Deliberately narrow. A general "capital after a lowercase" test looks
 * right and is badly wrong here: hyphenated given names ("Pierre-Joseph",
 * "Jean-Léon") and the Mc/Mac prefix ("McNeill") both match it, which
 * flagged 18 real artists including the corpus's most prolific. So each
 * hyphen/apostrophe/dot-separated segment is judged on its own.
 */
function hasCamelAnomaly(token: string): boolean {
  for (const segment of token.split(/[.\-'’]/)) {
    if (segment.length < 2) continue;
    // An all-caps segment is an initialism or a generational suffix
    // ("Erasmus Quellinus II", "Pieter de Jode II"), not a username.
    if (!/\p{Ll}/u.test(segment)) continue;
    // "FilpoC" — a capital hanging off the end of an otherwise normal word.
    if (/\p{Lu}$/u.test(segment)) return true;
    // "PMRMaeyaert" — two or more capitals immediately followed by lowercase.
    if (/\p{Lu}{2,}\p{Ll}/u.test(segment)) return true;
  }
  return false;
}

/**
 * Classify an artist name, or return null when it looks like an ordinary
 * personal name. Empty/absent names return null — a genuinely anonymous
 * work is fine, it simply has no artist page.
 */
export function flagArtistName(name: string | null | undefined): ArtistNameFlag | null {
  if (name === null || name === undefined) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  if (isPlaceholderArtistName(trimmed)) return "placeholder";

  // Explicit wiki-user leftovers.
  if (/^:?(w:)?user:/i.test(trimmed)) return "uploader-handle";
  // Digits and underscores never appear in a curated artist name here, but
  // are common in usernames.
  if (/[\d_]/.test(trimmed)) return "uploader-handle";
  // "dalbera" — a name that doesn't start with a capital.
  if (/^\p{Ll}/u.test(trimmed)) return "uploader-handle";

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.some(hasCamelAnomaly)) return "uploader-handle";
  // "Ji-Elle": a *single* hyphenated token capitalised on both sides. Only
  // applied to one-token names so "Vigée-Le Brun" stays untouched.
  if (tokens.length === 1 && /^\p{Lu}[\p{L}'’]*-\p{Lu}/u.test(trimmed)) return "uploader-handle";

  if (tokens.length === 1) return "unconfirmed-mononym";
  return null;
}
